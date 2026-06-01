import api from './axios';

export const leavesApi = {
  // Types
  listTypes: () => api.get('/leaves/types').then((r) => r.data),
  createType: (payload) => api.post('/leaves/types', payload).then((r) => r.data),
  updateType: (id, payload) => api.patch(`/leaves/types/${id}`, payload).then((r) => r.data),
  deleteType: (id) => api.delete(`/leaves/types/${id}`).then((r) => r.data),

  // Balances
  balances: (params = {}) => api.get('/leaves/balances', { params }).then((r) => r.data),
  allocate: (payload) => api.post('/leaves/balances/allocate', payload).then((r) => r.data),
  accrueMonthly: (payload) => api.post('/leaves/balances/accrue-monthly', payload).then((r) => r.data),

  // Requests
  list: (params = {}) => api.get('/leaves/requests', { params }).then((r) => r.data),
  submit: (payload) => api.post('/leaves/requests', payload).then((r) => r.data),
  approve: (id) => api.post(`/leaves/requests/${id}/approve`).then((r) => r.data),
  reject: (id, comment) => api.post(`/leaves/requests/${id}/reject`, { comment }).then((r) => r.data),
  cancel: (id) => api.post(`/leaves/requests/${id}/cancel`).then((r) => r.data),
  preview: (params) => api.get('/leaves/requests/preview', { params }).then((r) => r.data),

  // Reports
  calendar: (params = {}) => api.get('/leaves/calendar', { params }).then((r) => r.data),
  report: (params = {}) => api.get('/leaves/report', { params }).then((r) => r.data),
};

export default leavesApi;
