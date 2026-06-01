import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChevronLeft } from 'lucide-react';

import { workersApi } from '../../api/workers';
import { sitesApi } from '../../api/sites';
import { agenciesApi } from '../../api/agencies';
import { ErrorBox } from '../../components/Skeleton.jsx';

const CATEGORIES = ['permanent', 'contract', 'temporary', 'subcontractor'];
const ROLES = ['worker', 'supervisor', 'hr', 'agency_admin'];

const baseSchema = {
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email required'),
  employeeId: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
  category: z.enum(CATEGORIES),
  role: z.enum(ROLES),
  site_id: z.string().optional().or(z.literal('')),
  shift_id: z.string().optional().or(z.literal('')),
  agency_id: z.string().optional().or(z.literal('')),
};

const createSchema = z.object({
  ...baseSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const updateSchema = z.object({
  ...baseSchema,
  password: z.string().optional().or(z.literal('')),
});

export default function WorkerFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const sitesQuery = useQuery({ queryKey: ['sites'], queryFn: () => sitesApi.list() });
  const agenciesQuery = useQuery({ queryKey: ['agencies'], queryFn: () => agenciesApi.list() });
  const workerQuery = useQuery({
    queryKey: ['worker', id],
    queryFn: () => workersApi.get(id),
    enabled: isEdit,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(isEdit ? updateSchema : createSchema),
    defaultValues: { category: 'permanent', role: 'worker' },
  });

  useEffect(() => {
    if (isEdit && workerQuery.data?.worker) {
      const w = workerQuery.data.worker;
      reset({
        name: w.name || '',
        email: w.email || '',
        employeeId: w.employeeId || '',
        department: w.department || '',
        category: w.category || 'permanent',
        role: w.role || 'worker',
        site_id: w.site_id?._id || w.site_id || '',
        shift_id: w.shift_id?._id || w.shift_id || '',
        agency_id: w.agency_id?._id || w.agency_id || '',
        password: '',
      });
    }
  }, [isEdit, workerQuery.data, reset]);

  const mutation = useMutation({
    mutationFn: (payload) => {
      const clean = { ...payload };
      if (isEdit && !clean.password) delete clean.password;
      // Strip empty optional strings → omit fields rather than send "".
      ['employeeId', 'department', 'site_id', 'shift_id', 'agency_id'].forEach((k) => {
        if (!clean[k]) delete clean[k];
      });
      return isEdit ? workersApi.update(id, clean) : workersApi.create(clean);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Worker updated' : 'Worker created');
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      navigate('/workers');
    },
    onError: (err) => {
      const body = err?.response?.data;
      toast.error(body?.error || 'Save failed');
    },
  });

  if (isEdit && workerQuery.isError) {
    return (
      <div className="p-6">
        <ErrorBox error={workerQuery.error} onRetry={() => workerQuery.refetch()} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <Link to="/workers" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft size={16} /> Back to workers
      </Link>
      <h1 className="text-2xl font-bold text-slate-800 mt-2">
        {isEdit ? 'Edit Worker' : 'Add Worker'}
      </h1>

      <form
        onSubmit={handleSubmit((vals) => mutation.mutate(vals))}
        className="mt-6 bg-white rounded-lg shadow-sm p-6 max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <Field label="Full name" error={errors.name?.message}>
          <input {...register('name')} className={inputCls} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <input type="email" {...register('email')} className={inputCls} />
        </Field>
        <Field
          label={isEdit ? 'New password (optional)' : 'Password'}
          error={errors.password?.message}
        >
          <input type="password" {...register('password')} className={inputCls} />
        </Field>
        <Field label="Employee ID" error={errors.employeeId?.message}>
          <input {...register('employeeId')} className={inputCls} />
        </Field>
        <Field label="Department" error={errors.department?.message}>
          <input {...register('department')} className={inputCls} />
        </Field>
        <Field label="Category" error={errors.category?.message}>
          <select {...register('category')} className={selectCls}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Role" error={errors.role?.message}>
          <select {...register('role')} className={selectCls}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Site" error={errors.site_id?.message}>
          <select {...register('site_id')} className={selectCls}>
            <option value="">— None —</option>
            {(sitesQuery.data?.items || []).map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Agency" error={errors.agency_id?.message}>
          <select {...register('agency_id')} className={selectCls}>
            <option value="">— None —</option>
            {(agenciesQuery.data?.items || []).map((a) => (
              <option key={a._id} value={a._id}>{a.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Shift ID (optional)" error={errors.shift_id?.message}>
          <input {...register('shift_id')} className={inputCls} placeholder="ObjectId of shift" />
        </Field>

        <div className="md:col-span-2 flex justify-end gap-2 pt-2 border-t">
          <Link to="/workers" className="px-3 py-2 rounded-md border border-slate-300 text-sm">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || mutation.isPending}
            className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            {isSubmitting || mutation.isPending ? 'Saving…' : isEdit ? 'Update' : 'Create worker'}
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
