import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Plus, Upload, Pencil, ArrowRightLeft, UserX, Search } from 'lucide-react';
import toast from 'react-hot-toast';

import { workersApi } from '../../api/workers';
import { sitesApi } from '../../api/sites';
import { SkeletonRow, ErrorBox } from '../../components/Skeleton.jsx';
import BulkImportModal from './BulkImportModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const CATEGORIES = ['permanent', 'contract', 'temporary', 'subcontractor'];
const STATUSES = ['active', 'inactive'];

export default function WorkerListPage() {
  const { user } = useAuth();
  const canWrite = user?.role === 'superadmin' || user?.role === 'hr';
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({
    site: '', category: '', status: '', search: '', page: 1, limit: 25,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [transferFor, setTransferFor] = useState(null);

  const sitesQuery = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.list(),
  });

  const workersQuery = useQuery({
    queryKey: ['workers', filters],
    queryFn: () => workersApi.list(filters),
    keepPreviousData: true,
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => workersApi.deactivate(id),
    onSuccess: () => {
      toast.success('Worker deactivated');
      queryClient.invalidateQueries({ queryKey: ['workers'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Deactivate failed'),
  });

  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  const items = workersQuery.data?.items || [];
  const pagination = workersQuery.data?.pagination;

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Workers</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage workforce across sites and agencies.
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border border-slate-300 hover:bg-slate-100"
            >
              <Upload size={16} /> Bulk Import
            </button>
            <Link
              to="/workers/new"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800"
            >
              <Plus size={16} /> Add Worker
            </Link>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-slate-500">Search</label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 text-slate-400" size={14} />
            <input
              value={filters.search}
              onChange={(e) => setFilter({ search: e.target.value })}
              placeholder="Name, email, employee ID"
              className="mt-1 w-full pl-7 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Site</label>
          <select
            value={filters.site}
            onChange={(e) => setFilter({ site: e.target.value })}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            disabled={user?.role === 'supervisor'}
          >
            <option value="">All sites</option>
            {(sitesQuery.data?.items || []).map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Category</label>
          <select
            value={filters.category}
            onChange={(e) => setFilter({ category: e.target.value })}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
          >
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Status</label>
          <select
            value={filters.status}
            onChange={(e) => setFilter({ status: e.target.value })}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
          >
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {workersQuery.isError && (
          <div className="p-4">
            <ErrorBox error={workersQuery.error} onRetry={() => workersQuery.refetch()} />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Employee ID</th>
                <th className="px-4 py-3 text-left">Site</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Agency</th>
                <th className="px-4 py-3 text-left">Shift</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workersQuery.isLoading && Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} cols={8} />
              ))}
              {!workersQuery.isLoading && items.length === 0 && !workersQuery.isError && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No workers match these filters.
                  </td>
                </tr>
              )}
              {items.map((w) => (
                <tr key={w._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{w.name}</div>
                    <div className="text-xs text-slate-500">{w.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{w.employeeId || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{w.site_id?.name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{w.category}</td>
                  <td className="px-4 py-3 text-slate-600">{w.agency_id?.name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{w.shift_id?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        w.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {w.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && (
                      <div className="inline-flex gap-1">
                        <Link
                          to={`/workers/${w._id}`}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </Link>
                        <button
                          onClick={() => setTransferFor(w)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
                          title="Transfer"
                        >
                          <ArrowRightLeft size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Deactivate ${w.name}?`)) deactivateMutation.mutate(w._id);
                          }}
                          className="p-1.5 rounded hover:bg-red-50 text-red-600"
                          title="Deactivate"
                        >
                          <UserX size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
            <div className="text-slate-500">
              Page {pagination.page} of {pagination.pages} · {pagination.total} workers
            </div>
            <div className="flex gap-2">
              <button
                disabled={pagination.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                className="px-3 py-1 rounded border border-slate-300 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                disabled={pagination.page >= pagination.pages}
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                className="px-3 py-1 rounded border border-slate-300 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <BulkImportModal open={importOpen} onClose={() => setImportOpen(false)} />

      {transferFor && (
        <TransferModal
          worker={transferFor}
          sites={sitesQuery.data?.items || []}
          onClose={() => setTransferFor(null)}
        />
      )}
    </div>
  );
}

function TransferModal({ worker, sites, onClose }) {
  const [siteId, setSiteId] = useState(worker.site_id?._id || '');
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => workersApi.transfer(worker._id, { site_id: siteId }),
    onSuccess: () => {
      toast.success('Worker transferred');
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Transfer failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <h2 className="text-lg font-semibold text-slate-800">Transfer {worker.name}</h2>
        <p className="text-sm text-slate-500 mt-1">
          Currently at: {worker.site_id?.name || 'Unassigned'}
        </p>
        <label className="block mt-4 text-sm font-medium text-slate-700">Target site</label>
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 bg-white"
        >
          <option value="">Choose a site…</option>
          {sites.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 text-sm">
            Cancel
          </button>
          <button
            disabled={!siteId || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            {mutation.isPending ? 'Transferring…' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}
