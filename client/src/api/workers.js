import api from './axios';

export const workersApi = {
  list: (params = {}) => api.get('/workers', { params }).then((r) => r.data),
  get: (id) => api.get(`/workers/${id}`).then((r) => r.data),
  create: (payload) => api.post('/workers', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/workers/${id}`, payload).then((r) => r.data),
  deactivate: (id) => api.delete(`/workers/${id}`).then((r) => r.data),
  transfer: (id, payload) => api.post(`/workers/${id}/transfer`, payload).then((r) => r.data),
  bulkImport: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post('/workers/bulk-import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
};

export default workersApi;
