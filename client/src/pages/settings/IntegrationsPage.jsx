import { useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Download, Settings, X } from 'lucide-react';

import { settingsApi } from '../../api/settings';

const INTEGRATIONS = [
  {
    key: 'adp',
    name: 'ADP',
    color: '#d20962',
    description: 'Export approved timesheets in ADP Workforce Now CSV format.',
    type: 'payroll',
  },
  {
    key: 'quickbooks',
    name: 'QuickBooks',
    color: '#2ca01c',
    description: 'Push timesheets and hours into QuickBooks Online Time Tracking.',
    type: 'payroll',
  },
  {
    key: 'paychex',
    name: 'Paychex',
    color: '#0033a0',
    description: 'Bulk payroll export tailored to Paychex Flex import.',
    type: 'payroll',
    comingSoon: true,
  },
  {
    key: 'darwinbox',
    name: 'Darwinbox',
    color: '#5b3fff',
    description: 'Two-way sync of workers, attendance, and leave with Darwinbox HRMS.',
    type: 'hrms',
    comingSoon: true,
  },
  {
    key: 'sap',
    name: 'SAP SuccessFactors',
    color: '#0070f2',
    description: 'Connect SAP SuccessFactors Employee Central for org sync.',
    type: 'hrms',
    comingSoon: true,
  },
];

// In a real product we'd persist connection state in an Integration model.
// For now, "connected" is tracked client-side per browser via localStorage.
function getConnectedMap() {
  try { return JSON.parse(localStorage.getItem('truein.integrations') || '{}'); } catch { return {}; }
}
function setConnectedMap(map) {
  localStorage.setItem('truein.integrations', JSON.stringify(map));
}

export default function IntegrationsPage() {
  const [connected, setConnected] = useState(getConnectedMap);
  const [modal, setModal] = useState(null);

  function markConnected(key, payload) {
    const next = { ...connected, [key]: { ...payload, connectedAt: new Date().toISOString() } };
    setConnected(next);
    setConnectedMap(next);
  }
  function disconnect(key) {
    const next = { ...connected };
    delete next[key];
    setConnected(next);
    setConnectedMap(next);
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-800">Integrations</h1>
      <p className="text-sm text-slate-500 mt-0.5">
        Connect payroll and HRMS systems. Payroll integrations export approved timesheets.
      </p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {INTEGRATIONS.map((it) => {
          const conn = connected[it.key];
          return (
            <div key={it.key} className="bg-white rounded-lg shadow-sm p-5 flex flex-col">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: it.color }}
                  >
                    {it.name[0]}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">{it.name}</h3>
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">
                      {it.type}
                    </span>
                  </div>
                </div>
                {conn ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    <CheckCircle2 size={12} /> Connected
                  </span>
                ) : it.comingSoon ? (
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    Coming soon
                  </span>
                ) : null}
              </div>

              <p className="text-sm text-slate-600 mt-3 flex-1">{it.description}</p>

              {conn?.connectedAt && (
                <p className="text-[11px] text-slate-400 mt-2">
                  Connected {new Date(conn.connectedAt).toLocaleString()}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                {it.type === 'payroll' && !it.comingSoon && conn && (
                  <button
                    onClick={() => setModal({ kind: 'export', integration: it })}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 text-xs hover:bg-slate-100"
                  >
                    <Download size={12} /> Export now
                  </button>
                )}
                <button
                  disabled={it.comingSoon}
                  onClick={() => setModal({ kind: 'configure', integration: it, conn })}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs disabled:opacity-50
                    bg-slate-900 text-white hover:bg-slate-800"
                >
                  <Settings size={12} />
                  {conn ? 'Configure' : 'Connect'}
                </button>
                {conn && (
                  <button
                    onClick={() => disconnect(it.key)}
                    className="text-xs text-rose-600 hover:underline"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modal?.kind === 'configure' && (
        <ConfigureModal
          integration={modal.integration}
          initial={modal.conn}
          onClose={() => setModal(null)}
          onSave={(payload) => {
            markConnected(modal.integration.key, payload);
            setModal(null);
            toast.success(`${modal.integration.name} configured`);
          }}
        />
      )}
      {modal?.kind === 'export' && (
        <PayrollExportModal
          integration={modal.integration}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function ConfigureModal({ integration, initial, onClose, onSave }) {
  const [apiKey, setApiKey] = useState(initial?.apiKey || '');
  const [secret, setSecret] = useState(initial?.secret || '');
  const [mapping, setMapping] = useState(initial?.mapping || {
    employeeId: 'employeeId',
    regularHours: 'totalHours',
    otHours: 'otHours',
  });
  const [testing, setTesting] = useState(false);

  async function testConnection() {
    setTesting(true);
    try {
      // No actual external call yet — stub a positive response so the UX
      // works. Wire the real auth handshake when each integration is
      // implemented in the backend.
      await new Promise((r) => setTimeout(r, 600));
      toast.success('Connection looks good (stubbed)');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-800">Configure {integration.name}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">API key</span>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">API secret</span>
            <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} className={inputCls} />
          </label>

          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">Field mapping</div>
            <table className="min-w-full text-xs border rounded">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-1.5 text-left">PunchIn field</th>
                  <th className="px-3 py-1.5 text-left">{integration.name} field</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(mapping).map(([field, vendor]) => (
                  <tr key={field} className="border-t">
                    <td className="px-3 py-1.5 text-slate-700">{field}</td>
                    <td className="px-3 py-1.5">
                      <input
                        value={vendor}
                        onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}
                        className="w-full px-2 py-1 border border-slate-200 rounded"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <button
            onClick={testConnection}
            disabled={testing}
            className="px-3 py-2 rounded-md border border-slate-300 text-sm disabled:opacity-50"
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 text-sm">
            Cancel
          </button>
          <button
            disabled={!apiKey}
            onClick={() => onSave({ apiKey, secret, mapping })}
            className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            Save & connect
          </button>
        </div>
      </div>
    </div>
  );
}

function PayrollExportModal({ integration, onClose }) {
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  async function doExport() {
    setBusy(true);
    try {
      await settingsApi.exportPayroll(integration.key, { periodStart: from, periodEnd: to });
      toast.success(`${integration.name} export downloaded`);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <h2 className="text-lg font-semibold text-slate-800">Export to {integration.name}</h2>
        <p className="text-sm text-slate-500 mt-1">Approved timesheets in the period range are exported.</p>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <label className="block">
            <span className="text-xs text-slate-500">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 text-sm">Cancel</button>
          <button
            onClick={doExport}
            disabled={busy}
            className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            {busy ? 'Generating…' : 'Download CSV'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none';
