import api from './axios';

export const timesheetsApi = {
  list: (params = {}) => api.get('/timesheets', { params }).then((r) => r.data),
  get: (id) => api.get(`/timesheets/${id}`).then((r) => r.data),
  queue: (params = {}) => api.get('/timesheets/queue', { params }).then((r) => r.data),

  generate: (payload) => api.post('/timesheets/generate', payload).then((r) => r.data),
  approve: (id) => api.post(`/timesheets/${id}/approve`).then((r) => r.data),
  reject: (id, comment) => api.post(`/timesheets/${id}/reject`, { comment }).then((r) => r.data),
  bulkApprove: (ids) => api.post('/timesheets/bulk-approve', { ids }).then((r) => r.data),

  // File exports return a Blob, not JSON.
  exportFile: (format, params = {}) =>
    api.get('/timesheets/export', {
      params: { ...params, format },
      responseType: 'blob',
    }),
  exportPayroll: (format, params = {}) =>
    api.get('/timesheets/export-payroll', {
      params: { ...params, format },
      responseType: 'blob',
    }),
};

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default timesheetsApi;
