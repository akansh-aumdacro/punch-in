import api from './axios';

export const faceApi = {
  // Enroll / re-enroll a face. Omit userId to enroll yourself.
  enroll: (imageBase64, userId) =>
    api.post('/face/enroll', { imageBase64, userId }).then((r) => r.data),
  // Enrollment status for self (no arg) or a specific worker.
  status: (userId) =>
    api.get(userId ? `/face/status/${userId}` : '/face/status').then((r) => r.data),
  // Verification audit trail (managers).
  logs: (params = {}) => api.get('/face/logs', { params }).then((r) => r.data),
  // Remove an enrollment (HR/superadmin).
  remove: (userId) => api.delete(`/face/${userId}`).then((r) => r.data),
};

export default faceApi;
