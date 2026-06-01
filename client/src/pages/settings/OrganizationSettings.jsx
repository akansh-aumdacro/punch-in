import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Upload, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { settingsApi } from '../../api/settings';
import { ErrorBox } from '../../components/Skeleton.jsx';

const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
  'Europe/London', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Australia/Sydney',
];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD'];

export default function OrganizationSettings() {
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    name: '', timezone: 'Asia/Kolkata', country: 'IN', currency: 'INR',
    fiscalYearStart: '04-01',
  });

  const orgQuery = useQuery({
    queryKey: ['settings', 'org'],
    queryFn: () => settingsApi.getOrg(),
  });

  useEffect(() => {
    const o = orgQuery.data?.organization;
    if (!o) return;
    setForm({
      name: o.name || '',
      timezone: o.timezone || 'Asia/Kolkata',
      country: o.country || 'IN',
      currency: o.currency || 'INR',
      fiscalYearStart: o.settings?.fiscalYearStart || '04-01',
    });
  }, [orgQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => settingsApi.updateOrg({
      name: form.name,
      timezone: form.timezone,
      country: form.country,
      currency: form.currency,
      settings: { ...(orgQuery.data?.organization?.settings || {}), fiscalYearStart: form.fiscalYearStart },
    }),
    onSuccess: () => {
      toast.success('Organization updated');
      queryClient.invalidateQueries({ queryKey: ['settings', 'org'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Save failed'),
  });

  const logoMutation = useMutation({
    mutationFn: (file) => settingsApi.uploadLogo(file),
    onSuccess: () => {
      toast.success('Logo updated');
      queryClient.invalidateQueries({ queryKey: ['settings', 'org'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Upload failed'),
  });

  const org = orgQuery.data?.organization;

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-800">Organization Settings</h1>
      <p className="text-sm text-slate-500 mt-0.5">
        Configure your org-wide profile and defaults.
      </p>

      {orgQuery.isError && <ErrorBox error={orgQuery.error} onRetry={() => orgQuery.refetch()} />}

      <div className="mt-6 bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center gap-4 mb-6">
          {org?.logo ? (
            <img src={org.logo} alt="logo" className="w-16 h-16 rounded object-cover border" />
          ) : (
            <div className="w-16 h-16 rounded bg-slate-100 flex items-center justify-center">
              <Building2 size={24} className="text-slate-400" />
            </div>
          )}
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && logoMutation.mutate(e.target.files[0])}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={logoMutation.isPending}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-100 disabled:opacity-50"
            >
              <Upload size={14} />
              {logoMutation.isPending ? 'Uploading…' : 'Upload logo'}
            </button>
            <p className="text-[11px] text-slate-400 mt-1">PNG/JPG, up to 10 MB.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Organization name">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Timezone">
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className={`${inputCls} bg-white`}
            >
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </Field>
          <Field label="Country (ISO-2)">
            <input
              value={form.country}
              maxLength={2}
              onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })}
              className={inputCls}
            />
          </Field>
          <Field label="Currency">
            <select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className={`${inputCls} bg-white`}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Fiscal year start (MM-DD)" hint="e.g. 04-01 for India">
            <input
              value={form.fiscalYearStart}
              placeholder="04-01"
              onChange={(e) => setForm({ ...form, fiscalYearStart: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            <Save size={14} />
            {saveMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none';

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </label>
  );
}
