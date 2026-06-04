import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Building2, Users, Mail, Phone, User, Pencil, Trash2, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';

import { agenciesApi } from '../../api/agencies';
import { SkeletonCard, ErrorBox } from '../../components/Skeleton.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function AgencyListPage() {
  const { user } = useAuth();
  const canWrite = user?.role === 'superadmin' || user?.role === 'hr';
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // null | { mode:'create' } | { mode:'edit', agency }

  const agenciesQuery = useQuery({
    queryKey: ['agencies', search],
    queryFn: () => agenciesApi.list(search ? { search } : {}),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['agencies'] });

  const deleteMutation = useMutation({
    mutationFn: (id) => agenciesApi.remove(id),
    onSuccess: () => {
      toast.success('Agency removed');
      invalidate();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Delete failed'),
  });

  const items = agenciesQuery.data?.items || [];

  const onDelete = (agency) => {
    if (window.confirm(`Remove “${agency.name}”? Workers linked to it keep their records.`)) {
      deleteMutation.mutate(agency._id);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Agencies</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Staffing partners and contractors supplying your workforce.
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => setModal({ mode: 'create' })}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <Plus size={16} /> Add Agency
          </button>
        )}
      </div>

      <div className="relative mb-5 max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, contact, email"
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
        />
      </div>

      {agenciesQuery.isError && (
        <ErrorBox error={agenciesQuery.error} onRetry={() => agenciesQuery.refetch()} />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agenciesQuery.isLoading &&
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}

        {!agenciesQuery.isLoading && items.length === 0 && !agenciesQuery.isError && (
          <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-400">
            <Building2 size={28} className="mx-auto mb-2 opacity-50" />
            {search ? 'No agencies match your search.' : 'No agencies yet.'}{' '}
            {canWrite && !search && (
              <button onClick={() => setModal({ mode: 'create' })} className="text-slate-700 underline">
                Add one
              </button>
            )}
          </div>
        )}

        {items.map((agency) => (
          <motion.div
            key={agency._id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="group rounded-xl border border-slate-200/70 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 text-indigo-600">
                  <Building2 size={18} />
                </span>
                <div>
                  <h3 className="font-semibold text-slate-800">{agency.name}</h3>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Users size={12} /> {agency.workerCount ?? 0} worker
                    {agency.workerCount === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              {canWrite && (
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    title="Edit"
                    onClick={() => setModal({ mode: 'edit', agency })}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    title="Remove"
                    onClick={() => onDelete(agency)}
                    className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <Row icon={User} value={agency.contactPerson} empty="No contact person" />
              <Row icon={Mail} value={agency.email} empty="No email" />
              <Row icon={Phone} value={agency.phone} empty="No phone" />
            </dl>
          </motion.div>
        ))}
      </div>

      {modal && (
        <AgencyModal
          mode={modal.mode}
          agency={modal.agency}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function Row({ icon: Icon, value, empty }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="shrink-0 text-slate-400" />
      <span className={value ? 'text-slate-700' : 'text-slate-400'}>{value || empty}</span>
    </div>
  );
}

function AgencyModal({ mode, agency, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState({
    name: agency?.name || '',
    contactPerson: agency?.contactPerson || '',
    email: agency?.email || '',
    phone: agency?.phone || '',
  });

  const mutation = useMutation({
    mutationFn: () =>
      isEdit ? agenciesApi.update(agency._id, form) : agenciesApi.create(form),
    onSuccess: () => {
      toast.success(isEdit ? 'Agency updated' : 'Agency created');
      onSaved();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Save failed'),
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.name.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">
            {isEdit ? 'Edit Agency' : 'Add Agency'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mutation.mutate();
          }}
        >
          <Field label="Agency name" required>
            <input value={form.name} onChange={set('name')} className={inputCls} placeholder="e.g. BlueCollar Staffing" />
          </Field>
          <Field label="Contact person">
            <input value={form.contactPerson} onChange={set('contactPerson')} className={inputCls} placeholder="Full name" />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={set('email')} className={inputCls} placeholder="contact@agency.com" />
          </Field>
          <Field label="Phone">
            <input value={form.phone} onChange={set('phone')} className={inputCls} placeholder="+91 98765 43210" />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || mutation.isPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create agency'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

const inputCls =
  'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30';

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}
