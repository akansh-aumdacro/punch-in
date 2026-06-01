import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, CalendarCog, Users } from 'lucide-react';
import toast from 'react-hot-toast';

import { leavesApi } from '../../api/leaves';
import { sitesApi } from '../../api/sites';
import { SkeletonCard, SkeletonRow, ErrorBox } from '../../components/Skeleton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function LeaveBalancePage() {
  const { user } = useAuth();
  const isAdmin = ['superadmin', 'hr'].includes(user?.role);
  const isWorkerView = user?.role === 'worker' || user?.role === 'agency_admin';

  const [year, setYear] = useState(new Date().getFullYear());
  const [allocOpen, setAllocOpen] = useState(false);

  const balancesQuery = useQuery({
    queryKey: ['leaves', 'balances', year],
    queryFn: () => leavesApi.balances({ year }),
  });

  const typesQuery = useQuery({
    queryKey: ['leaves', 'types'],
    queryFn: () => leavesApi.listTypes(),
  });

  const accrueMutation = useMutation({
    mutationFn: () => leavesApi.accrueMonthly({ year }),
    onSuccess: (res) => {
      toast.success(`Accrued for ${res.processed} workers`);
      balancesQuery.refetch();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Accrual failed'),
  });

  // Worker view aggregates balances by leave type (one card each).
  if (isWorkerView) {
    return (
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">My Leave Balance</h1>
            <p className="text-sm text-slate-500 mt-0.5">Year {year}</p>
          </div>
        </div>

        {balancesQuery.isError && <ErrorBox error={balancesQuery.error} onRetry={() => balancesQuery.refetch()} />}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {balancesQuery.isLoading &&
            Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}

          {!balancesQuery.isLoading && balancesQuery.data?.items?.length === 0 && (
            <div className="col-span-full bg-white rounded-lg shadow-sm p-12 text-center text-slate-400">
              No leave allocated for {year}. Contact HR.
            </div>
          )}

          {(balancesQuery.data?.items || []).map((b) => (
            <BalanceCard key={b._id} balance={b} />
          ))}
        </div>
      </div>
    );
  }

  // HR / Supervisor view: per-worker table with one column per leave type.
  const balances = balancesQuery.data?.items || [];
  const types = typesQuery.data?.items || [];

  const grouped = useMemo(() => {
    const byUser = new Map();
    for (const b of balances) {
      const uid = String(b.user_id?._id || b.user_id);
      if (!byUser.has(uid)) {
        byUser.set(uid, { user: b.user_id, byType: {} });
      }
      byUser.get(uid).byType[String(b.leaveType_id?._id || b.leaveType_id)] = b;
    }
    return Array.from(byUser.values());
  }, [balances]);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Leave Balances</h1>
          <p className="text-sm text-slate-500 mt-0.5">Year {year}</p>
        </div>

        <div className="flex items-end gap-2">
          <label className="block">
            <span className="text-xs text-slate-500">Year</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="mt-1 ml-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white"
            >
              {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>

          {isAdmin && (
            <>
              <button
                onClick={() => accrueMutation.mutate()}
                disabled={accrueMutation.isPending}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm border border-slate-300 hover:bg-slate-100"
              >
                <CalendarCog size={14} />
                {accrueMutation.isPending ? 'Running…' : 'Run monthly accrual'}
              </button>
              <button
                onClick={() => setAllocOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800"
              >
                <Sparkles size={14} /> Allocate Leaves
              </button>
            </>
          )}
        </div>
      </div>

      {balancesQuery.isError && (
        <ErrorBox error={balancesQuery.error} onRetry={() => balancesQuery.refetch()} />
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left sticky left-0 bg-slate-50">Worker</th>
                {types.map((lt) => (
                  <th key={lt._id} className="px-3 py-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: lt.color || '#0ea5e9' }}
                      />
                      {lt.name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                      used / total
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {balancesQuery.isLoading &&
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={types.length + 1} />)}

              {!balancesQuery.isLoading && grouped.length === 0 && (
                <tr>
                  <td colSpan={types.length + 1} className="px-4 py-10 text-center text-slate-400">
                    No balances for {year}.{' '}
                    {isAdmin && (
                      <button onClick={() => setAllocOpen(true)} className="underline text-slate-700">
                        Allocate now
                      </button>
                    )}
                  </td>
                </tr>
              )}

              {grouped.map(({ user: w, byType }) => (
                <tr key={w._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 sticky left-0 bg-white border-r">
                    <div className="font-medium text-slate-800">{w.name}</div>
                    <div className="text-xs text-slate-500">{w.employeeId || w.email}</div>
                  </td>
                  {types.map((lt) => {
                    const b = byType[String(lt._id)];
                    return (
                      <td key={lt._id} className="px-3 py-3 text-center">
                        {b ? (
                          <div>
                            <div className="font-medium text-slate-800">
                              {b.balance} / {b.allocated + (b.carried || 0)}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {b.used} used{b.carried ? ` · +${b.carried} cf` : ''}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {allocOpen && (
        <AllocateModal year={year} onClose={() => setAllocOpen(false)} />
      )}
    </div>
  );
}

function BalanceCard({ balance }) {
  const lt = balance.leaveType_id || {};
  const total = (balance.allocated || 0) + (balance.carried || 0);
  const used = balance.used || 0;
  const remaining = balance.balance || 0;
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: lt.color || '#0ea5e9' }} />
          <h3 className="font-semibold text-slate-800">{lt.name || '—'}</h3>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          lt.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
        }`}>
          {lt.isPaid ? 'Paid' : 'Unpaid'}
        </span>
      </div>

      <div className="mt-4 text-3xl font-bold text-slate-800">
        {remaining} <span className="text-base font-normal text-slate-500">days remaining</span>
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {used} used · {balance.allocated} allocated{balance.carried ? ` · +${balance.carried} carried fwd` : ''}
      </div>

      <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full"
          style={{ width: `${usedPct}%`, backgroundColor: lt.color || '#0ea5e9' }}
        />
      </div>
    </div>
  );
}

function AllocateModal({ year, onClose }) {
  const queryClient = useQueryClient();
  const sitesQuery = useQuery({ queryKey: ['sites'], queryFn: () => sitesApi.list() });
  const [allocYear, setAllocYear] = useState(year);
  const [siteId, setSiteId] = useState('');

  const mutation = useMutation({
    mutationFn: () => leavesApi.allocate({ year: allocYear, siteId: siteId || undefined }),
    onSuccess: (res) => {
      toast.success(`Allocated ${res.allocated} entries for ${res.workers} workers`);
      queryClient.invalidateQueries({ queryKey: ['leaves', 'balances'] });
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Allocation failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <h2 className="text-lg font-semibold text-slate-800">Allocate Leaves</h2>
        <p className="text-sm text-slate-500 mt-1">
          Creates fresh balances for every active worker × leave type for the chosen year.
          Carry-forward from the previous year applies up to each type's <code>carryForwardMax</code>.
        </p>

        <label className="block mt-4">
          <span className="text-xs text-slate-500">Year</span>
          <input
            type="number"
            value={allocYear}
            onChange={(e) => setAllocYear(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block mt-3">
          <span className="text-xs text-slate-500">Restrict to site (optional)</span>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            <option value="">All sites</option>
            {(sitesQuery.data?.items || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 text-sm">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            <Users size={14} className="inline mr-1" />
            {mutation.isPending ? 'Allocating…' : 'Allocate'}
          </button>
        </div>
      </div>
    </div>
  );
}
