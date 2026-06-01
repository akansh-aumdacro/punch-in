import api from './axios';

export const shiftsApi = {
  // Templates
  list: () => api.get('/shifts').then((r) => r.data),
  create: (payload) => api.post('/shifts', payload).then((r) => r.data),
  update: (id, payload) => api.patch(`/shifts/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/shifts/${id}`).then((r) => r.data),

  // Assignments
  assign: (payload) => api.post('/shifts/assign', payload).then((r) => r.data),
  autoAssign: (payload) => api.post('/shifts/auto-assign', payload).then((r) => r.data),
  moveAssignment: (id, payload) =>
    api.patch(`/shifts/assignments/${id}/move`, payload).then((r) => r.data),
  deleteAssignment: (id) =>
    api.delete(`/shifts/assignments/${id}`).then((r) => r.data),

  // Calendars
  workerCalendar: (userId, params = {}) =>
    api.get(`/shifts/calendar/worker/${userId}`, { params }).then((r) => r.data),
  siteCalendar: (params = {}) =>
    api.get('/shifts/calendar/site', { params }).then((r) => r.data),

  // Swaps
  listSwaps: (params = {}) => api.get('/shifts/swaps', { params }).then((r) => r.data),
  createSwap: (payload) => api.post('/shifts/swaps', payload).then((r) => r.data),
  reviewSwap: (id, payload) =>
    api.post(`/shifts/swaps/${id}/review`, payload).then((r) => r.data),

  // Weekly off
  listWeeklyOff: () => api.get('/shifts/weekly-off').then((r) => r.data),
  setWeeklyOff: (payload) => api.post('/shifts/weekly-off', payload).then((r) => r.data),
  deleteWeeklyOff: (id) => api.delete(`/shifts/weekly-off/${id}`).then((r) => r.data),
};

export default shiftsApi;
