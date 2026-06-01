// Lightweight singleton so services can emit socket events without holding a
// reference to the Express app. setIo() is called once by the socket config
// module at server startup; emit* helpers fail silently if io was never set
// (e.g. when running unit tests).
let _io = null;

exports.setIo = (io) => {
  _io = io;
};

exports.getIo = () => _io;

exports.emitAttendance = (event, orgId, payload) => {
  if (!_io || !orgId) return;
  _io.of('/attendance').to(`org:${orgId}`).emit(event, payload);
};

// Generic org-scoped emitter. Reuses the /attendance namespace because
// clients are already connected there — semantically it's a "realtime"
// channel, not attendance-only. Used by leave / shift modules for
// notifications.
exports.emitToOrg = (event, orgId, payload) => {
  if (!_io || !orgId) return;
  _io.of('/attendance').to(`org:${orgId}`).emit(event, payload);
};

// Direct-to-user emitter — used by the notification service so the bell
// can light up immediately for the recipient.
exports.emitToUser = (event, userId, payload) => {
  if (!_io || !userId) return;
  _io.of('/attendance').to(`user:${userId}`).emit(event, payload);
};
