import api from './axios';
import { downloadBlob } from './timesheets';

export const reportsApi = {
  // JSON fetch — used by the viewer to render charts/tables.
  fetch: (type, params = {}) =>
    api.get(`/reports/${type}`, { params: { ...params, format: 'json' } }).then((r) => r.data),

  // File export — backend streams CSV/XLSX/PDF.
  exportFile: (type, format, params = {}) =>
    api.get(`/reports/${type}`, {
      params: { ...params, format },
      responseType: 'blob',
    }),

  // Schedules
  listSchedules: () => api.get('/reports/schedules').then((r) => r.data),
  createSchedule: (payload) => api.post('/reports/schedules', payload).then((r) => r.data),
  updateSchedule: (id, payload) => api.patch(`/reports/schedules/${id}`, payload).then((r) => r.data),
  deleteSchedule: (id) => api.delete(`/reports/schedules/${id}`).then((r) => r.data),
  runScheduleNow: (id) => api.post(`/reports/schedules/${id}/run-now`).then((r) => r.data),
};

export { downloadBlob };
export default reportsApi;
