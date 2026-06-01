import api from './axios';

export const sitesApi = {
  list: () => api.get('/sites').then((r) => r.data),
  get: (id) => api.get(`/sites/${id}`).then((r) => r.data),
  create: (payload) => api.post('/sites', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/sites/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/sites/${id}`).then((r) => r.data),
  liveAttendance: (id) => api.get(`/sites/${id}/live-attendance`).then((r) => r.data),
};

export default sitesApi;
