import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Plus, Pencil, Trash2, X, Lock, Check } from 'lucide-react';
import toast from 'react-hot-toast';

import { settingsApi } from '../../api/settings';
import { ErrorBox, SkeletonRow } from '../../components/Skeleton.jsx';

// The four permission columns shown in the summary, in display order.
const PERMISSIONS = [
  { key: 'create', label: 'Create' },
  { key: 'assign', label: 'Assign' },
  { key: 'viewAll', label: 'View All' },
  { key: 'delete', label: 'Delete' },
];

const emptyPerms = { create: false, assign: false, viewAll: false, delete: false };

export default function RolesPermissionsPage() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null); // null | { mode: 'create' } | { mode: 'edit', role }

  const rolesQuery = useQuery({
    queryKey: ['settings', 'roles'],
    queryFn: () => settingsApi.listRoles(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['settings', 'roles'] });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => settingsApi.updateRole(id, payload),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err?.response?.data?.error || 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => settingsApi.deleteRole(id),
    onSuccess: () => {
      toast.success('Role deleted');
      invalidate();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Delete failed'),
  });

  const roles = rolesQuery.data?.items || [];

  // Toggle a single permission inline (superadmin is locked).
  const togglePermission = (role, key) => {
    if (role.locked) return;
    const next = { ...role.permissions, [key]: !role.permissions[key] };
    updateMutation.mutate({ id: role._id, payload: { permissions: next } });
  };

  const onDelete = (role) => {
    if (role.isSystem) return;
    if (window.confirm(`Delete the “${role.name}” role? This cannot be undone.`)) {
      deleteMutation.mutate(role._id);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Shield size={22} /> Roles &amp; Permissions
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Define what each role can see and do across the app.
            </p>
          </div>
          <button
            onClick={() => setModal({ mode: 'create' })}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            <Plus size={16} /> Create New Role
          </button>
        </div>

        {rolesQuery.isError && (
          <div className="mt-4">
            <ErrorBox error={rolesQuery.error} onRetry={() => rolesQuery.refetch()} />
          </div>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-3 pr-4 font-semibold">Role Name</th>
                <th className="py-3 pr-4 font-semibold">Description</th>
                <th className="py-3 pr-4 font-semibold">Permissions Summary</th>
                <th className="py-3 pl-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rolesQuery.isLoading ? (
                [...Array(5)].map((_, i) => <SkeletonRow key={i} cols={4} />)
              ) : (
                roles.map((role) => (
                  <tr key={role._id} className="border-b border-slate-100 last:border-0">
                    <td className="py-4 pr-4 font-semibold text-slate-800 whitespace-nowrap">
                      {role.name}
                      {role.locked && (
                        <Lock size={12} className="inline ml-1.5 -mt-0.5 text-slate-400" />
                      )}
                    </td>
                    <td className="py-4 pr-4 text-slate-500">{role.description || '—'}</td>
                    <td className="py-4 pr-4">
                      <div className="flex flex-wrap gap-2">
                        {PERMISSIONS.map((p) => (
                          <PermissionPill
                            key={p.key}
                            label={p.label}
                            on={Boolean(role.permissions?.[p.key])}
                            locked={role.locked}
                            onClick={() => togglePermission(role, p.key)}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="py-4 pl-4">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          title="Edit role"
                          onClick={() => setModal({ mode: 'edit', role })}
                          className="text-slate-500 hover:text-slate-800"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          title={role.isSystem ? 'Built-in roles can’t be deleted' : 'Delete role'}
                          onClick={() => onDelete(role)}
                          disabled={role.isSystem}
                          className={
                            role.isSystem
                              ? 'text-rose-200 cursor-not-allowed'
                              : 'text-rose-500 hover:text-rose-700'
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <RoleModal
          mode={modal.mode}
          role={modal.role}
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

function PermissionPill({ label, on, locked, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      title={locked ? 'Super Admin always has full access' : 'Click to toggle'}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs transition ${
        on
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-50 text-slate-400'
      } ${locked ? 'cursor-not-allowed opacity-90' : 'hover:border-slate-400'}`}
    >
      {label} {on ? <Check size={12} /> : <X size={12} />}
    </button>
  );
}

function RoleModal({ mode, role, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const locked = Boolean(role?.locked);
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [permissions, setPermissions] = useState({ ...emptyPerms, ...(role?.permissions || {}) });

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { name, description, permissions };
      return isEdit
        ? settingsApi.updateRole(role._id, payload)
        : settingsApi.createRole(payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Role updated' : 'Role created');
      onSaved();
    },
    onError: (err) => toast.error(err?.response?.data?.error || 'Save failed'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-xl shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">
            {isEdit ? 'Edit Role' : 'Create New Role'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {locked && (
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
            Super Admin has full access by default — its permissions can't be changed.
          </p>
        )}

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Role name</span>
            <input
              value={name}
              disabled={role?.isSystem}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Head of Department"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
            />
            {role?.isSystem && (
              <span className="text-[11px] text-slate-400">Built-in role name is fixed.</span>
            )}
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this role is for"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </label>

          <div>
            <span className="text-sm font-medium text-slate-700">Permissions</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {PERMISSIONS.map((p) => (
                <label
                  key={p.key}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'
                  } border-slate-200`}
                >
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={Boolean(permissions[p.key])}
                    onChange={(e) => setPermissions({ ...permissions, [p.key]: e.target.checked })}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || locked || name.trim().length < 2}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create role'}
          </button>
        </div>
      </div>
    </div>
  );
}
