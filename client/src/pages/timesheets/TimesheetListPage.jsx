import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ChevronDown, Download, CheckCheck, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { timesheetsApi, downloadBlob } from '../../api/timesheets';
import { sitesApi } from '../../api/sites';
import { agenciesApi } from '../../api/agencies';
import { SkeletonRow, ErrorBox } from '../../components/Skeleton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const TABS = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'daily', label: 'Daily' },
  { key: 'bySite', label: 'By Site' },
  { key: 'byAgency', label: 'By Agency' },
  { key: 'exceptions', label: 'Exceptions' },
];

const EXPORT_OPTIONS = [
  { key: 'csv',        label: 'CSV',              kind: 'standard',  ext: 'csv'  },
  { key: 'xlsx',       label: 'Excel (.xlsx)',    kind: 'standard',  ext: 'xlsx' },
  { key: 'pdf',        label: 'PDF',              kind: 'standard',  ext: 'pdf'  },
  { key: 'adp',        label: 'ADP CSV',          kind: 'payroll',   ext: 'csv'  },
  { key: 'quickbooks', label: 'QuickBooks CSV',   kind: 'payroll',   ext: 'csv'  },
];

export default function TimesheetListPage() {
  const { user } = useAuth();
  const canApprove = ['superadmin', 'hr', 'supervisor'].includes(user?.role);
  const queryClient = useQueryClient();

  const today = new Date().toISOString().slice(0, 10);
  const aMonthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [tab, setTab] = useState('weekly');
  const [filters, setFilters] = useState({
    from: aMonthAgo,
    to: today,
    siteId: '',
    agencyId: '',
    search: '',
    status: '',
    page: 1,
    limit: 25,
  });
  const [selected, setSelected] = useState(new Set());
  const [generateOpen, setGenerateOpen] = useState(false);

  // Tab → query params translation.
  const queryParams = useMemo(() => {
    const base = { ...filters };
    if (tab === 'weekly') base.periodType = 'weekly';
    else if (tab === 'monthly') base.periodType = 'monthly';
    else if (tab === 'daily') base.periodType = 'daily';
    else if (tab === 'exceptions') base.status = 'pending';
    return base;
  }, [filters, tab]);

  const sitesQuery = useQuery({ queryKey: ['sites'], queryFn: () => sitesApi.list() });
  const agenciesQuery = useQuery({ queryKey: ['agencies'], queryFn: () => agenciesApi.list() });

  const listQuery = useQuery({
    queryKey: ['timesheets', queryParams],
    queryFn: () => timesheetsApi.list(queryParams),
    keepPreviousData: true,
  });

  const items = listQuery.data?.items || [];
  const pagination = listQuery.data?.pagination;

  const bulkApprove = useMutation({
    mutationFn: () => timesheetsApi.bulkApprove(Array.from(selected)),
    onSuccess: (res) => {
      toast.success(`Approved ${res.approved} (${res.skipped} skipped, ${res.failed} failed)`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Bulk approve failed'),
  });

  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const eligibleIds = items
      .filter((t) => t.status === 'pending' && !t.lockedAt)
      .map((t) => t._id);
    if (eligibleIds.every((id) => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligibleIds));
    }
  };

  // Group rows by site or agency for the corresponding tabs.
  const grouped = useMemo(() => {
    if (tab !== 'bySite' && tab !== 'byAgency') return null;
    const keyFn = tab === 'bySite'
      ? (t) => t.user_id?.site_id?.name || '— Unassigned —'
      : (t) => t.user_id?.agency_id?.name || '— No agency —';
    const groups = new Map();
    for (const t of items) {
      const k = keyFn(t);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    return Array.from(groups, ([key, list]) => ({ key, list }));
  }, [items, tab]);

  // Exceptions tab: highlight rows with anomalies.
  const isException = (t) =>
    (t.lateMinutes || 0) > 60 || (t.lopDays || 0) > 0 || (t.otHours || 0) > 12;

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Timesheets</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review, approve, and export worker timesheets.
          </p>
        </div>
        <div className="flex gap-2">
          {canApprove && (
            <button
              onClick={() => setGenerateOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border border-slate-300 hover:bg-slate-100"
            >
              <Wand2 size={14} /> Generate
            </button>
          )}
          <ExportMenu queryParams={queryParams} />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-4 flex flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSelected(new Set()); }}
            className={`px-3 py-2 text-sm -mb-px border-b-2 ${
              tab === t.key
                ? 'border-slate-800 text-slate-800 font-medium'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex flex-wrap gap-3 items-end">
        <Field label="From">
          <input type="date" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} className={inputCls} />
        </Field>
        <Field label="To">
          <input type="date" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} className={inputCls} />
        </Field>
        {user?.role !== 'supervisor' && (
          <Field label="Site">
            <select value={filters.siteId} onChange={(e) => setFilter({ siteId: e.target.value })} className={`${inputCls} bg-white`}>
              <option value="">All</option>
              {(sitesQuery.data?.items || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Agency">
          <select value={filters.agencyId} onChange={(e) => setFilter({ agencyId: e.target.value })} className={`${inputCls} bg-white`}>
            <option value="">All</option>
            {(agenciesQuery.data?.items || []).map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={filters.status} onChange={(e) => setFilter({ status: e.target.value })} className={`${inputCls} bg-white`}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </Field>
        <Field label="Search">
          <input
            placeholder="Name, email, ID"
            value={filters.search}
            onChange={(e) => setFilter({ search: e.target.value })}
            className={inputCls}
          />
        </Field>

        {canApprove && selected.size > 0 && (
          <button
            disabled={bulkApprove.isPending}
            onClick={() => bulkApprove.mutate()}
            className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCheck size={14} /> Approve Selected ({selected.size})
          </button>
        )}
      </div>

      {listQuery.isError && (
        <ErrorBox error={listQuery.error} onRetry={() => listQuery.refetch()} />
      )}

      {/* Grouped (By Site / By Agency) view */}
      {grouped ? (
        <div className="space-y-4">
          {grouped.length === 0 && (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center text-slate-400">
              No timesheets match these filters.
            </div>
          )}
          {grouped.map(({ key, list }) => (
            <div key={key} className="bg-white rounded-lg shadow-sm">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-700">{key}</h2>
                <span className="text-xs text-slate-500">
                  {list.length} timesheets ·{' '}
                  {list.reduce((s, t) => s + (t.totalHours || 0), 0).toFixed(1)}h total
                </span>
              </div>
              <TimesheetTable
                items={list}
                canApprove={canApprove}
                selected={selected}
                onToggle={toggleSelected}
                isException={isException}
                highlightExceptions={tab === 'exceptions'}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <TimesheetTable
            items={items}
            loading={listQuery.isLoading}
            canApprove={canApprove}
            selected={selected}
            onToggle={toggleSelected}
            onToggleAll={toggleAll}
            allSelected={items.length > 0 && items
              .filter((t) => t.status === 'pending' && !t.lockedAt)
              .every((t) => selected.has(t._id))}
            isException={isException}
            highlightExceptions={tab === 'exceptions'}
          />

          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
              <div className="text-slate-500">
                Page {pagination.page} of {pagination.pages} · {pagination.total} records
              </div>
              <div className="flex gap-2">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                  className="px-3 py-1 rounded border border-slate-300 disabled:opacity-50"
                >Prev</button>
                <button
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                  className="px-3 py-1 rounded border border-slate-300 disabled:opacity-50"
                >Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {generateOpen && (
        <GenerateModal onClose={() => setGenerateOpen(false)} sites={sitesQuery.data?.items || []} />
      )}
    </div>
  );
}

function TimesheetTable({
  items, loading, canApprove, selected, onToggle, onToggleAll, allSelected,
  isException, highlightExceptions,
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
          <tr>
            {canApprove && (
              <th className="px-3 py-3 w-8">
                {onToggleAll && (
                  <input type="checkbox" checked={allSelected || false} onChange={onToggleAll} />
                )}
              </th>
            )}
            <th className="px-4 py-3 text-left">Worker</th>
            <th className="px-4 py-3 text-left">Period</th>
            <th className="px-4 py-3 text-right">Hours</th>
            <th className="px-4 py-3 text-right">OT</th>
            <th className="px-4 py-3 text-right">Late</th>
            <th className="px-4 py-3 text-right">Leave</th>
            <th className="px-4 py-3 text-right">LOP</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={canApprove ? 10 : 9} />)}

          {!loading && items.length === 0 && (
            <tr>
              <td colSpan={canApprove ? 10 : 9} className="px-4 py-10 text-center text-slate-400">
                No timesheets match these filters.
              </td>
            </tr>
          )}

          {items.map((t) => {
            const flag = isException && isException(t);
            return (
              <tr
                key={t._id}
                className={`hover:bg-slate-50 ${highlightExceptions && flag ? 'bg-rose-50' : ''}`}
              >
                {canApprove && (
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      disabled={t.status !== 'pending' || t.lockedAt}
                      checked={selected?.has(t._id) || false}
                      onChange={() => onToggle(t._id)}
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{t.user_id?.name || '—'}</div>
                  <div className="text-xs text-slate-500">
                    {t.user_id?.employeeId || t.user_id?.email}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {format(new Date(t.periodStart), 'dd MMM')} – {format(new Date(t.periodEnd), 'dd MMM yyyy')}
                </td>
                <td className="px-4 py-3 text-right">{(t.totalHours || 0).toFixed(1)}</td>
                <td className="px-4 py-3 text-right">{(t.otHours || 0).toFixed(1)}</td>
                <td className="px-4 py-3 text-right">{t.lateMinutes || 0}m</td>
                <td className="px-4 py-3 text-right">{t.leaveDays || 0}</td>
                <td className="px-4 py-3 text-right">{t.lopDays || 0}</td>
                <td className="px-4 py-3">
                  <StatusPill status={t.status} locked={Boolean(t.lockedAt)} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/timesheets/${t._id}`}
                    className="text-xs text-slate-700 hover:underline"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status, locked }) {
  const tones = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-rose-100 text-rose-700',
  };
  return (
    <div className="inline-flex items-center gap-1">
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tones[status] || 'bg-slate-100'}`}>
        {status}
      </span>
      {locked && <span className="text-[10px] text-slate-400">🔒</span>}
    </div>
  );
}

function ExportMenu({ queryParams }) {
  const [open, setOpen] = useState(false);

  async function handleExport(opt) {
    setOpen(false);
    try {
      const res = opt.kind === 'payroll'
        ? await timesheetsApi.exportPayroll(opt.key, queryParams)
        : await timesheetsApi.exportFile(opt.key, queryParams);
      const ts = format(new Date(), 'yyyyMMdd-HHmm');
      downloadBlob(res.data, `timesheets-${ts}.${opt.ext}`);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Export failed');
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800"
      >
        <Download size={14} /> Export <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 rounded-md shadow-lg bg-white border border-slate-200 z-20">
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-slate-400">Standard</div>
          {EXPORT_OPTIONS.filter((o) => o.kind === 'standard').map((o) => (
            <button key={o.key} onClick={() => handleExport(o)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">
              {o.label}
            </button>
          ))}
          <div className="border-t mt-1 px-3 py-1 text-[10px] uppercase tracking-wide text-slate-400">Payroll</div>
          {EXPORT_OPTIONS.filter((o) => o.kind === 'payroll').map((o) => (
            <button key={o.key} onClick={() => handleExport(o)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50">
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GenerateModal({ onClose, sites }) {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [siteId, setSiteId] = useState('');

  const mutation = useMutation({
    mutationFn: () => timesheetsApi.generate({ from, to, siteId: siteId || undefined }),
    onSuccess: (res) => {
      toast.success(`Generated ${res.generated || 0} (skipped ${res.skipped || 0}, failed ${res.failed || 0})`);
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Generate failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <h2 className="text-lg font-semibold text-slate-800">Generate Timesheets</h2>
        <p className="text-sm text-slate-500 mt-1">
          Aggregates attendance logs into timesheet records.
        </p>
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} /></Field>
        <Field label="Site (optional)">
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={`${inputCls} bg-white`}>
            <option value="">All sites</option>
            {sites.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 text-sm">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            {mutation.isPending ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none';

function Field({ label, children }) {
  return (
    <label className="block mt-3">
      <span className="block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
