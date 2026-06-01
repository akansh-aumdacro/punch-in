const jwt = require('jsonwebtoken');
const { setIo } = require('../services/socketBus');

// Sets up the /attendance namespace with JWT auth and per-org/per-site rooms.
// Clients connect with:
//   io('/attendance', { auth: { token: '<JWT>' } })
// On connect, sockets auto-join `org:<orgId>` (org-wide stream) and, if their
// JWT carries a siteId, `org:<orgId>:site:<siteId>`. Clients can also call
// emit('joinSite', siteId) / emit('leaveSite', siteId) to subscribe to other
// sites at runtime (HR/superadmin live dashboards).
function setupSocket(io) {
  const ns = io.of('/attendance');

  ns.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized: no token'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      return next();
    } catch (err) {
      return next(new Error('Unauthorized: invalid token'));
    }
  });

  ns.on('connection', (socket) => {
    const { orgId, siteId, userId } = socket.user || {};
    if (orgId) socket.join(`org:${orgId}`);
    if (orgId && siteId) socket.join(`org:${orgId}:site:${siteId}`);
    if (userId) socket.join(`user:${userId}`);

    socket.on('joinSite', (sId) => {
      if (orgId && sId) socket.join(`org:${orgId}:site:${sId}`);
    });
    socket.on('leaveSite', (sId) => {
      if (orgId && sId) socket.leave(`org:${orgId}:site:${sId}`);
    });
  });

  setIo(io);
  return ns;
}

module.exports = setupSocket;
