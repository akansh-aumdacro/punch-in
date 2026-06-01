import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChevronLeft, Trash2 } from 'lucide-react';

import { sitesApi } from '../../api/sites';
import { workersApi } from '../../api/workers';
import { ErrorBox } from '../../components/Skeleton.jsx';
import MapPicker from './MapPicker.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore',
  'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney',
];

const siteSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  address: z.string().optional().or(z.literal('')),
  lat: z.number({ invalid_type_error: 'Latitude is required' }).min(-90).max(90),
  lng: z.number({ invalid_type_error: 'Longitude is required' }).min(-180).max(180),
  radiusMeters: z.number().min(10).max(10000),
  geofenceEnabled: z.boolean(),
  timezone: z.string(),
  supervisors: z.array(z.string()).default([]),
});

export default function SiteFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canDelete = user?.role === 'superadmin' || user?.role === 'hr';

  const siteQuery = useQuery({
    queryKey: ['site', id],
    queryFn: () => sitesApi.get(id),
    enabled: isEdit,
  });

  const supervisorsQuery = useQuery({
    queryKey: ['workers', 'supervisors'],
    queryFn: () => workersApi.list({ limit: 200 }),
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(siteSchema),
    defaultValues: {
      name: '',
      address: '',
      lat: undefined,
      lng: undefined,
      radiusMeters: 100,
      geofenceEnabled: true,
      timezone: 'Asia/Kolkata',
      supervisors: [],
    },
  });

  useEffect(() => {
    if (isEdit && siteQuery.data?.site) {
      const s = siteQuery.data.site;
      reset({
        name: s.name || '',
        address: s.address || '',
        lat: typeof s.lat === 'number' ? s.lat : undefined,
        lng: typeof s.lng === 'number' ? s.lng : undefined,
        radiusMeters: s.radiusMeters ?? 100,
        geofenceEnabled: s.geofenceEnabled !== false,
        timezone: s.timezone || 'Asia/Kolkata',
        supervisors: (s.supervisors || []).map((sup) => sup._id || sup),
      });
    }
  }, [isEdit, siteQuery.data, reset]);

  const lat = watch('lat');
  const lng = watch('lng');
  const radiusMeters = watch('radiusMeters');
  const geofenceEnabled = watch('geofenceEnabled');

  const mutation = useMutation({
    mutationFn: (vals) => (isEdit ? sitesApi.update(id, vals) : sitesApi.create(vals)),
    onSuccess: () => {
      toast.success(isEdit ? 'Site updated' : 'Site created');
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      navigate('/sites');
    },
    onError: (err) => {
      toast.error(err?.response?.data?.error || 'Save failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => sitesApi.remove(id),
    onSuccess: () => {
      toast.success('Site deleted');
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      navigate('/sites');
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Delete failed'),
  });

  if (isEdit && siteQuery.isError) {
    return (
      <div className="p-6">
        <ErrorBox error={siteQuery.error} onRetry={() => siteQuery.refetch()} />
      </div>
    );
  }

  const supervisorOptions = (supervisorsQuery.data?.items || []).filter((u) =>
    ['supervisor', 'hr', 'superadmin'].includes(u.role)
  );

  return (
    <div className="p-6">
      <Link to="/sites" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft size={16} /> Back to sites
      </Link>
      <div className="flex justify-between items-start mt-2">
        <h1 className="text-2xl font-bold text-slate-800">
          {isEdit ? 'Edit Site' : 'Add Site'}
        </h1>
        {isEdit && canDelete && (
          <button
            onClick={() => {
              if (confirm('Delete this site?')) deleteMutation.mutate();
            }}
            className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"
          >
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>

      <form
        onSubmit={handleSubmit((vals) => mutation.mutate(vals))}
        className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl"
      >
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
          <Field label="Site name" error={errors.name?.message}>
            <input {...register('name')} className={inputCls} />
          </Field>
          <Field label="Address" error={errors.address?.message}>
            <input {...register('address')} className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude" error={errors.lat?.message}>
              <input
                type="number"
                step="any"
                {...register('lat', { valueAsNumber: true })}
                className={inputCls}
              />
            </Field>
            <Field label="Longitude" error={errors.lng?.message}>
              <input
                type="number"
                step="any"
                {...register('lng', { valueAsNumber: true })}
                className={inputCls}
              />
            </Field>
          </div>

          <Field
            label={`Geofence radius: ${radiusMeters || 0} m`}
            error={errors.radiusMeters?.message}
          >
            <input
              type="range"
              min={10}
              max={1000}
              step={10}
              {...register('radiusMeters', { valueAsNumber: true })}
              className="w-full"
            />
          </Field>

          <Field label="Timezone" error={errors.timezone?.message}>
            <select {...register('timezone')} className={selectCls}>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" {...register('geofenceEnabled')} />
            Enforce geofence on clock-in
          </label>

          <Field label="Supervisors">
            <Controller
              name="supervisors"
              control={control}
              render={({ field }) => (
                <SupervisorMultiSelect
                  options={supervisorOptions}
                  value={field.value || []}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="text-sm font-medium text-slate-700 mb-2">
            Map pin {geofenceEnabled && '(click to place)'}
          </div>
          <MapPicker
            lat={lat}
            lng={lng}
            radius={radiusMeters}
            onPick={(la, ln) => {
              setValue('lat', Number(la.toFixed(6)), { shouldValidate: true });
              setValue('lng', Number(ln.toFixed(6)), { shouldValidate: true });
            }}
          />
          <p className="text-xs text-slate-500 mt-2">
            Click anywhere on the map to drop a pin. The blue circle previews the geofence radius.
          </p>
        </div>

        <div className="lg:col-span-2 flex justify-end gap-2">
          <Link to="/sites" className="px-3 py-2 rounded-md border border-slate-300 text-sm">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || mutation.isPending}
            className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            {isSubmitting || mutation.isPending
              ? 'Saving…'
              : isEdit ? 'Update site' : 'Create site'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none text-sm';
const selectCls = inputCls + ' bg-white';

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function SupervisorMultiSelect({ options, value, onChange }) {
  const toggle = (id) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  return (
    <div className="mt-1 border border-slate-300 rounded-md p-2 max-h-40 overflow-y-auto text-sm">
      {options.length === 0 && <div className="text-slate-400 text-xs">No eligible users yet.</div>}
      {options.map((u) => (
        <label key={u._id} className="flex items-center gap-2 py-0.5 cursor-pointer">
          <input
            type="checkbox"
            checked={value.includes(u._id)}
            onChange={() => toggle(u._id)}
          />
          <span className="text-slate-700">{u.name}</span>
          <span className="text-xs text-slate-400">({u.role})</span>
        </label>
      ))}
    </div>
  );
}
