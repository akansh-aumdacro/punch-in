import api from './axios';

export const attendanceApi = {
  clockIn: (payload) => api.post('/attendance/clock-in', payload).then((r) => r.data),
  clockOut: (payload) => api.post('/attendance/clock-out', payload).then((r) => r.data),
  live: (params = {}) => api.get('/attendance/live', { params }).then((r) => r.data),
  logs: (params = {}) => api.get('/attendance/logs', { params }).then((r) => r.data),
  history: (userId, params = {}) =>
    api.get(`/attendance/history/${userId}`, { params }).then((r) => r.data),
  markAbsent: (payload = {}) => api.post('/attendance/mark-absent', payload).then((r) => r.data),
  regularize: (payload) => api.post('/attendance/regularize', payload).then((r) => r.data),
  approveRegularization: (id, decision) =>
    api.post(`/attendance/${id}/approve`, { decision }).then((r) => r.data),
  syncOffline: (punches) =>
    api.post('/attendance/sync-offline', { punches }).then((r) => r.data),
};

export default attendanceApi;
