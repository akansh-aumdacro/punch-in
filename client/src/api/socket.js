import { io } from 'socket.io-client';
import { TOKEN_STORAGE_KEY } from './axios';

const BASE = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

let socket = null;

// Lazy-init the /attendance namespace socket. Re-uses the JWT in localStorage
// so it tracks login/logout state via tokens; callers should call disconnect()
// from useAuth.logout() (currently not wired — see notes in summary).
export function getAttendanceSocket() {
  if (socket && socket.connected) return socket;
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) return null;

  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }

  socket = io(`${BASE}/attendance`, {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
  });

  return socket;
}

export function disconnectAttendanceSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
