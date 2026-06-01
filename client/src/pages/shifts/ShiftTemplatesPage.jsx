import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Clock, Trash2, X, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';

import { shiftsApi } from '../../api/shifts';
import { SkeletonCard, ErrorBox } from '../../components/Skeleton.jsx';
import { toneForShift, DAYS_OF_WEEK } from '../../utils/shiftColors';
import { useAuth } from '../../context/AuthContext.jsx';

const SHIFT_TYPES = ['fixed', 'rotating', 'flexible', 'split', 'multiday'];

export default function ShiftTemplatesPage() {
  const { user } = useAuth();
  const canWrite = ['superadmin', 'hr', 'supervisor'].includes(user?.role);
  const queryClient = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const shiftsQuery = useQuery({
    queryKey: ['shifts', 'templates'],
    queryFn: () => shiftsApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => shiftsApi.remove(id),
    onSuccess: () => {
      toast.success('Shift deleted');
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Delete failed'),
  });

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Shift Templates</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Define reusable shift patterns for the scheduler.
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800"
          >
            <Plus size={16} /> New Shift
          </button>
        )}
      </div>

      {shiftsQuery.isError && (
        <ErrorBox error={shiftsQuery.error} onRetry={() => shiftsQuery.refetch()} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {shiftsQuery.isLoading &&
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}

        {!shiftsQuery.isLoading &&
          shiftsQuery.data?.items?.length === 0 &&
          !shiftsQuery.isError && (
            <div className="col-span-full bg-white rounded-lg shadow-sm p-12 text-center text-slate-400">
              No shift templates yet.
              {canWrite && (
                <button
                  onClick={() => { setEditing(null); setModalOpen(true); }}
                  className="ml-2 text-slate-700 underline"
                >
                  Create one
                </button>
              )}
            </div>
          )}

        {(shiftsQuery.data?.items || []).map((s) => (
          <ShiftCard
            key={s._id}
            shift={s}
            canWrite={canWrite}
            onEdit={() => { setEditing(s); setModalOpen(true); }}
            onDelete={() => {
              if (confirm(`Delete shift "${s.name}"?`)) deleteMutation.mutate(s._id);
            }}
          />
        ))}
      </div>

      {modalOpen && (
        <ShiftFormModal
          shift={editing}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function ShiftCard({ shift, canWrite, onEdit, onDelete }) {
  const tone = toneForShift(shift.type);
  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-800">{shift.name}</h3>
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
            <Clock size={12} /> {shift.startTime} – {shift.endTime}
            {shift.breakMinutes ? ` · ${shift.breakMinutes}m break` : ''}
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${tone.pill}`}>
          {shift.type}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1">
        {DAYS_OF_WEEK.map((d) => {
          const active = shift.daysOfWeek?.includes(d.value);
          return (
            <span
              key={d.value}
              className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium ${
                active ? `${tone.pill} border` : 'bg-slate-50 text-slate-400'
              }`}
              title={d.label}
            >
              {d.short}
            </span>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>Grace: {shift.gracePeriodMinutes ?? 0}m</span>
        {canWrite && (
          <div className="flex gap-1">
            <button onClick={onEdit} className="p-1.5 rounded hover:bg-slate-100">
              <Pencil size={14} />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-50 text-red-600">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ShiftFormModal({ shift, onClose }) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(shift?._id);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: shift || {
      name: '',
      startTime: '09:00',
      endTime: '17:00',
      breakMinutes: 30,
      type: 'fixed',
      gracePeriodMinutes: 10,
      daysOfWeek: [1, 2, 3, 4, 5],
    },
  });

  const mutation = useMutation({
    mutationFn: (payload) => {
      const days = Object.keys(payload)
        .filter((k) => k.startsWith('dow_') && payload[k])
        .map((k) => Number(k.slice(4)));
      const body = {
        name: payload.name,
        startTime: payload.startTime,
        endTime: payload.endTime,
        breakMinutes: Number(payload.breakMinutes) || 0,
        gracePeriodMinutes: Number(payload.gracePeriodMinutes) || 0,
        type: payload.type,
        daysOfWeek: days,
      };
      return isEdit ? shiftsApi.update(shift._id, body) : shiftsApi.create(body);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Shift updated' : 'Shift created');
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Save failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEdit ? 'Edit Shift' : 'New Shift'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit((vals) => mutation.mutate(vals))}
          className="p-5 grid grid-cols-2 gap-4"
        >
          <Field label="Name" error={errors.name?.message} cols={2}>
            <input
              {...register('name', { required: 'Name is required', minLength: 2 })}
              className={inputCls}
            />
          </Field>
          <Field label="Start time">
            <input type="time" {...register('startTime', { required: true })} className={inputCls} />
          </Field>
          <Field label="End time">
            <input type="time" {...register('endTime', { required: true })} className={inputCls} />
          </Field>
          <Field label="Break (minutes)">
            <input type="number" min={0} {...register('breakMinutes')} className={inputCls} />
          </Field>
          <Field label="Grace period (minutes)">
            <input type="number" min={0} {...register('gracePeriodMinutes')} className={inputCls} />
          </Field>
          <Field label="Type" cols={2}>
            <select {...register('type')} className={`${inputCls} bg-white`}>
              {SHIFT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Days of week" cols={2}>
            <div className="flex gap-1 mt-1">
              {DAYS_OF_WEEK.map((d) => (
                <label
                  key={d.value}
                  className="flex flex-col items-center gap-1 text-[10px] cursor-pointer"
                >
                  <span className="text-slate-500">{d.short}</span>
                  <input
                    type="checkbox"
                    defaultChecked={shift?.daysOfWeek?.includes(d.value) ?? [1,2,3,4,5].includes(d.value)}
                    {...register(`dow_${d.value}`)}
                  />
                </label>
              ))}
            </div>
          </Field>

          <div className="col-span-2 flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-md border border-slate-300 text-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || mutation.isPending}
              className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
            >
              {isSubmitting || mutation.isPending ? 'Saving…' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none text-sm';

function Field({ label, error, children, cols }) {
  return (
    <div className={cols === 2 ? 'col-span-2' : ''}>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
