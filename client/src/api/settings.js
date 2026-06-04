import api from './axios';
import { downloadBlob } from './timesheets';

export const settingsApi = {
  getOrg: () => api.get('/settings/org').then((r) => r.data),
  updateOrg: (payload) => api.patch('/settings/org', payload).then((r) => r.data),
  uploadLogo: (file) => {
    const form = new FormData();
    form.append('logo', file);
    return api.post('/settings/org/logo', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },

  listPolicies: (params = {}) => api.get('/settings/policies', { params }).then((r) => r.data),
  upsertPolicy: (payload) => api.post('/settings/policies', payload).then((r) => r.data),
  deletePolicy: (id) => api.delete(`/settings/policies/${id}`).then((r) => r.data),

  listRoles: () => api.get('/settings/roles').then((r) => r.data),
  createRole: (payload) => api.post('/settings/roles', payload).then((r) => r.data),
  updateRole: (id, payload) => api.patch(`/settings/roles/${id}`, payload).then((r) => r.data),
  deleteRole: (id) => api.delete(`/settings/roles/${id}`).then((r) => r.data),

  listApiKeys: () => api.get('/settings/api-keys').then((r) => r.data),
  createApiKey: (payload) => api.post('/settings/api-keys', payload).then((r) => r.data),
  revokeApiKey: (id) => api.post(`/settings/api-keys/${id}/revoke`).then((r) => r.data),
  deleteApiKey: (id) => api.delete(`/settings/api-keys/${id}`).then((r) => r.data),

  exportPayroll: async (format, payload) => {
    const res = await api.post('/settings/integrations/export-payroll',
      { format, ...payload },
      { responseType: 'blob' });
    const ts = new Date().toISOString().slice(0, 10);
    downloadBlob(res.data, `payroll-${format}-${ts}.csv`);
    return res;
  },
};

export default settingsApi;
