import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { Plus, Trash2, X, Copy, AlertTriangle, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';

import { settingsApi } from '../../api/settings';

const SCOPES = [
  'workers:read', 'workers:write',
  'attendance:read', 'timesheets:read',
  'webhooks:write',
];

export default function APIKeysPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState(null);

  const listQuery = useQuery({
    queryKey: ['settings', 'api-keys'],
    queryFn: () => settingsApi.listApiKeys(),
  });

  const revoke = useMutation({
    mutationFn: (id) => settingsApi.revokeApiKey(id),
    onSuccess: () => {
      toast.success('Key revoked');
      queryClient.invalidateQueries({ queryKey: ['settings', 'api-keys'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id) => settingsApi.deleteApiKey(id),
    onSuccess: () => {
      toast.success('Key deleted');
      queryClient.invalidateQueries({ queryKey: ['settings', 'api-keys'] });
    },
  });

  const items = listQuery.data?.items || [];

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">API Keys</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Generate keys for the public <code>/v1</code> API. Keys are scoped to your org.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800"
        >
          <Plus size={16} /> New API key
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Prefix</th>
              <th className="px-4 py-3 text-left">Scopes</th>
              <th className="px-4 py-3 text-left">Created</th>
              <th className="px-4 py-3 text-left">Last used</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {listQuery.isLoading && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            )}
            {!listQuery.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No API keys yet.
                </td>
              </tr>
            )}
            {items.map((k) => {
              const revoked = Boolean(k.revokedAt);
              return (
                <tr key={k._id}>
                  <td className="px-4 py-3 font-medium text-slate-800">{k.name}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-600">tk_{k.prefix}_…</td>
                  <td className="px-4 py-3 text-xs">
                    {(k.scopes || []).map((s) => (
                      <span key={s} className="inline-block bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 mr-1 mb-1">
                        {s}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {format(new Date(k.createdAt), 'yyyy-MM-dd')}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {k.lastUsedAt ? formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true }) : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    {revoked ? (
                      <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded">Revoked</span>
                    ) : (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!revoked ? (
                      <button
                        onClick={() => confirm(`Revoke key "${k.name}"? This is immediate.`) && revoke.mutate(k._id)}
                        className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100"
                      >
                        Revoke
                      </button>
                    ) : (
                      <button
                        onClick={() => confirm('Permanently delete this key record?') && remove.mutate(k._id)}
                        className="p-1.5 rounded text-rose-600 hover:bg-rose-50"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={(res) => {
            setNewKey(res);
            setCreateOpen(false);
            queryClient.invalidateQueries({ queryKey: ['settings', 'api-keys'] });
          }}
        />
      )}

      {newKey && <RevealModal data={newKey} onClose={() => setNewKey(null)} />}
    </div>
  );
}

function CreateModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState(['workers:read', 'attendance:read', 'timesheets:read']);

  const mutation = useMutation({
    mutationFn: () => settingsApi.createApiKey({ name, scopes: selected }),
    onSuccess: (res) => onCreated(res),
    onError: (err) => toast.error(err?.response?.data?.error || 'Create failed'),
  });

  function toggle(s) {
    setSelected((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">New API key</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Payroll Bridge prod"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div>
            <div className="text-sm font-medium text-slate-700 mb-1">Scopes</div>
            <div className="space-y-1">
              {SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.includes(s)} onChange={() => toggle(s)} />
                  <code className="text-xs">{s}</code>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 text-sm">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!name || mutation.isPending}
            className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating…' : 'Create key'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RevealModal({ data, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <KeyRound size={18} className="text-amber-500" />
          <h2 className="text-lg font-semibold text-slate-800">Save your API key now</h2>
        </div>
        <div className="p-5">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              This key will be shown <strong>once only</strong>. Copy it to a secrets manager — we store only a hash.
            </div>
          </div>

          <div className="mt-3 bg-slate-900 text-emerald-300 rounded-md p-3 font-mono text-xs break-all">
            {data.rawKey}
          </div>

          <button
            onClick={() => {
              navigator.clipboard?.writeText(data.rawKey);
              toast.success('Copied to clipboard');
            }}
            className="mt-3 inline-flex items-center gap-1 text-sm text-slate-700 hover:underline"
          >
            <Copy size={14} /> Copy
          </button>

          <div className="mt-4 text-xs text-slate-500">
            Use as <code>x-api-key</code> header against <code>/v1/*</code> endpoints.
          </div>
        </div>
        <div className="px-5 py-4 border-t flex justify-end">
          <button onClick={onClose} className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm">
            I have saved it
          </button>
        </div>
      </div>
    </div>
  );
}
