import api from './axios';

export const agenciesApi = {
  list: (params = {}) => api.get('/agencies', { params }).then((r) => r.data),
  get: (id) => api.get(`/agencies/${id}`).then((r) => r.data),
  create: (payload) => api.post('/agencies', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/agencies/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/agencies/${id}`).then((r) => r.data),
};

export default agenciesApi;
