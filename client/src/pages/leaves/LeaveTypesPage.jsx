import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

import { leavesApi } from '../../api/leaves';
import { SkeletonCard, ErrorBox } from '../../components/Skeleton.jsx';

const ACCRUAL = ['monthly', 'quarterly', 'yearly', 'none'];

export default function LeaveTypesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const typesQuery = useQuery({
    queryKey: ['leaves', 'types'],
    queryFn: () => leavesApi.listTypes(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => leavesApi.deleteType(id),
    onSuccess: () => {
      toast.success('Leave type removed');
      queryClient.invalidateQueries({ queryKey: ['leaves', 'types'] });
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Delete failed'),
  });

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Leave Types</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Define paid and unpaid leave categories with accrual and policy rules.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800"
        >
          <Plus size={16} /> New Leave Type
        </button>
      </div>

      {typesQuery.isError && (
        <ErrorBox error={typesQuery.error} onRetry={() => typesQuery.refetch()} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {typesQuery.isLoading &&
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}

        {!typesQuery.isLoading && typesQuery.data?.items?.length === 0 && (
          <div className="col-span-full bg-white rounded-lg shadow-sm p-12 text-center text-slate-400">
            No leave types yet.
            <button
              onClick={() => { setEditing(null); setModalOpen(true); }}
              className="ml-2 text-slate-700 underline"
            >Create one</button>
          </div>
        )}

        {(typesQuery.data?.items || []).map((lt) => (
          <div key={lt._id} className="bg-white rounded-lg shadow-sm p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: lt.color || '#0ea5e9' }}
                />
                <h3 className="font-semibold text-slate-800">{lt.name}</h3>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                lt.isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {lt.isPaid ? 'Paid' : 'Unpaid'}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Field label="Annual days" value={lt.annualDays || 0} />
              <Field label="Accrual" value={lt.accrualType} />
              <Field label="Carry forward" value={lt.carryForwardMax || 0} />
              <Field label="Advance notice" value={`${lt.advanceNoticeDays || 0}d`} />
              <Field label="Sandwich" value={lt.sandwichPolicy ? 'Yes' : 'No'} />
              <Field label="Max consec." value={lt.maxConsecutiveDays || '∞'} />
            </div>

            {(lt.blackoutPeriods || []).length > 0 && (
              <div className="mt-3 text-xs">
                <div className="text-slate-500 mb-1">Blackouts</div>
                <div className="flex flex-wrap gap-1">
                  {lt.blackoutPeriods.map((b, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded">
                      {format(new Date(b.start), 'dd MMM')} – {format(new Date(b.end), 'dd MMM')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-1">
              <button
                onClick={() => { setEditing(lt); setModalOpen(true); }}
                className="p-1.5 rounded hover:bg-slate-100"
              ><Pencil size={14} /></button>
              <button
                onClick={() => {
                  if (confirm(`Delete leave type "${lt.name}"?`)) deleteMutation.mutate(lt._id);
                }}
                className="p-1.5 rounded hover:bg-red-50 text-red-600"
              ><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {modalOpen && (
        <LeaveTypeModal
          leaveType={editing}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-slate-400 text-[10px] uppercase tracking-wide">{label}</div>
      <div className="text-slate-700 font-medium">{value}</div>
    </div>
  );
}

function LeaveTypeModal({ leaveType, onClose }) {
  const isEdit = Boolean(leaveType?._id);
  const queryClient = useQueryClient();
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm({
    defaultValues: leaveType || {
      name: '', isPaid: true, annualDays: 12, carryForwardMax: 0, sandwichPolicy: false,
      accrualType: 'yearly', advanceNoticeDays: 0, maxConsecutiveDays: 0,
      blackoutPeriods: [], color: '#0ea5e9',
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'blackoutPeriods' });

  const mutation = useMutation({
    mutationFn: (vals) => {
      const payload = {
        ...vals,
        annualDays: Number(vals.annualDays) || 0,
        carryForwardMax: Number(vals.carryForwardMax) || 0,
        advanceNoticeDays: Number(vals.advanceNoticeDays) || 0,
        maxConsecutiveDays: Number(vals.maxConsecutiveDays) || 0,
        isPaid: Boolean(vals.isPaid),
        sandwichPolicy: Boolean(vals.sandwichPolicy),
      };
      return isEdit ? leavesApi.updateType(leaveType._id, payload) : leavesApi.createType(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Updated' : 'Created');
      queryClient.invalidateQueries({ queryKey: ['leaves', 'types'] });
      onClose();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Save failed'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEdit ? 'Edit Leave Type' : 'New Leave Type'}
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="p-5 overflow-y-auto grid grid-cols-2 gap-4"
        >
          <FormField label="Name" error={errors.name?.message} cols={2}>
            <input
              {...register('name', { required: 'Name is required', minLength: 2 })}
              className={inputCls}
            />
          </FormField>

          <FormField label="Annual days">
            <input type="number" min={0} {...register('annualDays')} className={inputCls} />
          </FormField>
          <FormField label="Carry forward max">
            <input type="number" min={0} {...register('carryForwardMax')} className={inputCls} />
          </FormField>
          <FormField label="Advance notice (days)">
            <input type="number" min={0} {...register('advanceNoticeDays')} className={inputCls} />
          </FormField>
          <FormField label="Max consecutive days (0 = none)">
            <input type="number" min={0} {...register('maxConsecutiveDays')} className={inputCls} />
          </FormField>

          <FormField label="Accrual">
            <select {...register('accrualType')} className={`${inputCls} bg-white`}>
              {ACCRUAL.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </FormField>
          <FormField label="Color">
            <input type="color" {...register('color')} className="mt-1 w-full h-10 rounded border border-slate-300" />
          </FormField>

          <FormField cols={2}>
            <div className="mt-3 space-y-1">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" {...register('isPaid')} /> Paid leave
              </label>
              <label className="inline-flex items-center gap-2 text-sm ml-6">
                <input type="checkbox" {...register('sandwichPolicy')} />
                Sandwich policy (weekends count between leave days)
              </label>
            </div>
          </FormField>

          <FormField cols={2} label="Blackout periods">
            <div className="space-y-2 mt-1">
              {fields.map((f, idx) => (
                <div key={f.id} className="flex items-center gap-2">
                  <input
                    type="date"
                    {...register(`blackoutPeriods.${idx}.start`)}
                    className={inputCls}
                  />
                  <span className="text-slate-400">–</span>
                  <input
                    type="date"
                    {...register(`blackoutPeriods.${idx}.end`)}
                    className={inputCls}
                  />
                  <input
                    placeholder="Reason"
                    {...register(`blackoutPeriods.${idx}.reason`)}
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => append({ start: '', end: '', reason: '' })}
                className="text-xs text-slate-600 underline"
              >
                + Add blackout period
              </button>
            </div>
          </FormField>

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
  'mt-1 rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none text-sm';

function FormField({ label, children, error, cols }) {
  return (
    <div className={cols === 2 ? 'col-span-2' : ''}>
      {label && <label className="block text-sm font-medium text-slate-700">{label}</label>}
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
