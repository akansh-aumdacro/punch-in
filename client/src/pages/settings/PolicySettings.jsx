import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, ChevronDown, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { settingsApi } from '../../api/settings';
import { sitesApi } from '../../api/sites';
import { agenciesApi } from '../../api/agencies';

const SECTIONS = [
  {
    key: 'workingHours',
    label: 'Working Hours',
    fields: [
      { key: 'standardDayHours', label: 'Standard day hours', type: 'number', default: 8 },
      { key: 'weeklyWorkingDays', label: 'Working days / week', type: 'number', default: 5 },
      { key: 'maxDailyHours', label: 'Max daily hours', type: 'number', default: 12 },
    ],
  },
  {
    key: 'breaks',
    label: 'Breaks',
    fields: [
      { key: 'breakMinutes', label: 'Break minutes (per shift)', type: 'number', default: 30 },
      { key: 'autoDeductBreak', label: 'Auto-deduct unpaid break', type: 'boolean', default: true },
    ],
  },
  {
    key: 'overtime',
    label: 'Overtime',
    fields: [
      { key: 'otAuthThresholdHours', label: 'OT auth threshold (hours/day)', type: 'number', default: 2 },
      { key: 'otMultiplier', label: 'OT multiplier', type: 'number', default: 1.5, step: 0.1 },
      { key: 'weekendOtMultiplier', label: 'Weekend OT multiplier', type: 'number', default: 2.0, step: 0.1 },
    ],
  },
  {
    key: 'holidays',
    label: 'Holidays',
    fields: [
      { key: 'paidHolidaysPerYear', label: 'Paid holidays / year', type: 'number', default: 12 },
      { key: 'holidayPayMultiplier', label: 'Holiday pay multiplier', type: 'number', default: 2.0, step: 0.1 },
    ],
  },
  {
    key: 'regularization',
    label: 'Regularization',
    fields: [
      { key: 'maxRegularizationsPerMonth', label: 'Max regularizations / month', type: 'number', default: 3 },
      { key: 'regularizationWindowDays', label: 'Window after the fact (days)', type: 'number', default: 7 },
      { key: 'requireApproval', label: 'Require supervisor approval', type: 'boolean', default: true },
    ],
  },
  {
    key: 'leave',
    label: 'Leave',
    fields: [
      { key: 'minLeaveAdvanceDays', label: 'Min advance notice (days)', type: 'number', default: 2 },
      { key: 'maxConsecutiveLeaveDays', label: 'Max consecutive leave days', type: 'number', default: 14 },
      { key: 'sandwichPolicy', label: 'Apply sandwich policy globally', type: 'boolean', default: false },
    ],
  },
];

const SCOPE_OPTIONS = [
  { value: 'global', label: 'Global (all workers)' },
  { value: 'site', label: 'Specific site' },
  { value: 'category', label: 'Worker category' },
  { value: 'agency', label: 'Specific agency' },
];
const CATEGORIES = ['permanent', 'contract', 'temporary', 'subcontractor'];

export default function PolicySettings() {
  const queryClient = useQueryClient();
  const [scopeType, setScopeType] = useState('global');
  const [scopeId, setScopeId] = useState('');
  const [policyName, setPolicyName] = useState('Default policy');
  const [openSections, setOpenSections] = useState({ workingHours: true });
  const [rules, setRules] = useState({});

  const sitesQuery = useQuery({ queryKey: ['sites'], queryFn: () => sitesApi.list() });
  const agenciesQuery = useQuery({ queryKey: ['agencies'], queryFn: () => agenciesApi.list() });
  const policiesQuery = useQuery({
    queryKey: ['policies'],
    queryFn: () => settingsApi.listPolicies(),
  });

  // Merge stored values for the current scope into form state.
  const matchingPolicy = useMemo(() => {
    const items = policiesQuery.data?.items || [];
    return items.find((p) => {
      if (p.scopeType !== scopeType) return false;
      if (scopeType === 'global') return true;
      if (scopeType === 'site' || scopeType === 'agency') return String(p.scopeId) === String(scopeId);
      return p.scopeId === scopeId;
    });
  }, [policiesQuery.data, scopeType, scopeId]);

  // Reset form when scope changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => {
    if (matchingPolicy) {
      setPolicyName(matchingPolicy.name || 'Default policy');
      setRules(matchingPolicy.rules || {});
    } else {
      setRules({});
    }
  }, [matchingPolicy?._id]);

  const saveMutation = useMutation({
    mutationFn: () => settingsApi.upsertPolicy({
      name: policyName,
      scopeType,
      scopeId: scopeType === 'global' ? null : scopeId,
      rules,
    }),
    onSuccess: () => {
      toast.success('Policy saved');
      queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Save failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => settingsApi.deletePolicy(id),
    onSuccess: () => {
      toast.success('Policy removed');
      queryClient.invalidateQueries({ queryKey: ['policies'] });
    },
  });

  const getValue = (key, fallback) => {
    return rules[key] !== undefined && rules[key] !== '' ? rules[key] : fallback;
  };
  const setValue = (key, v) => setRules((r) => ({ ...r, [key]: v }));

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-800">Policy Settings</h1>
      <p className="text-sm text-slate-500 mt-0.5">
        Configure rules that apply globally or scoped to a site / category / agency.
      </p>

      {/* Scope picker */}
      <div className="mt-6 bg-white rounded-lg shadow-sm p-5 flex flex-wrap gap-3 items-end">
        <Field label="Apply to">
          <select
            value={scopeType}
            onChange={(e) => { setScopeType(e.target.value); setScopeId(''); }}
            className={`${inputCls} bg-white`}
          >
            {SCOPE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>

        {scopeType === 'site' && (
          <Field label="Site">
            <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className={`${inputCls} bg-white`}>
              <option value="">Choose…</option>
              {(sitesQuery.data?.items || []).map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </Field>
        )}
        {scopeType === 'agency' && (
          <Field label="Agency">
            <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className={`${inputCls} bg-white`}>
              <option value="">Choose…</option>
              {(agenciesQuery.data?.items || []).map((a) => (
                <option key={a._id} value={a._id}>{a.name}</option>
              ))}
            </select>
          </Field>
        )}
        {scopeType === 'category' && (
          <Field label="Category">
            <select value={scopeId} onChange={(e) => setScopeId(e.target.value)} className={`${inputCls} bg-white`}>
              <option value="">Choose…</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        )}

        <Field label="Policy name">
          <input value={policyName} onChange={(e) => setPolicyName(e.target.value)} className={inputCls} />
        </Field>

        <button
          disabled={
            saveMutation.isPending ||
            (scopeType !== 'global' && !scopeId)
          }
          onClick={() => saveMutation.mutate()}
          className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
        >
          <Save size={14} /> Save policy
        </button>
      </div>

      {/* Sections */}
      <div className="mt-4 space-y-3">
        {SECTIONS.map((section) => {
          const open = openSections[section.key];
          return (
            <div key={section.key} className="bg-white rounded-lg shadow-sm">
              <button
                onClick={() => setOpenSections((o) => ({ ...o, [section.key]: !o[section.key] }))}
                className="w-full px-5 py-3 flex items-center justify-between"
              >
                <span className="font-semibold text-slate-800 text-sm">{section.label}</span>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                  {section.fields.map((f) => (
                    <Field key={f.key} label={f.label}>
                      {f.type === 'boolean' ? (
                        <label className="inline-flex items-center gap-2 mt-1 text-sm">
                          <input
                            type="checkbox"
                            checked={Boolean(getValue(f.key, f.default))}
                            onChange={(e) => setValue(f.key, e.target.checked)}
                          />
                          <span className="text-slate-600">Enabled</span>
                        </label>
                      ) : (
                        <input
                          type={f.type}
                          step={f.step || 1}
                          value={getValue(f.key, f.default)}
                          onChange={(e) => setValue(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                          className={inputCls}
                        />
                      )}
                    </Field>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Existing policies for this org */}
      <div className="mt-6 bg-white rounded-lg shadow-sm">
        <div className="px-5 py-3 border-b">
          <h2 className="text-sm font-semibold text-slate-800">Existing policies</h2>
        </div>
        {(policiesQuery.data?.items?.length || 0) === 0 ? (
          <div className="p-6 text-sm text-slate-400 text-center">No policies saved yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(policiesQuery.data?.items || []).map((p) => (
              <li key={p._id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-800 text-sm">{p.name}</div>
                  <div className="text-xs text-slate-500 capitalize">
                    {p.scopeType}
                    {p.scopeId && <> · {typeof p.scopeId === 'string' ? p.scopeId : p.scopeId._id || String(p.scopeId)}</>}
                    {' · '}{Object.keys(p.rules || {}).length} rule(s)
                  </div>
                </div>
                <button
                  onClick={() => confirm('Delete this policy?') && deleteMutation.mutate(p._id)}
                  className="p-1.5 rounded text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
