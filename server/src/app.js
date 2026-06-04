require('dotenv').config();

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');

const errorHandler = require('./middleware/errorHandler');

const app = express();

// gzip all responses — large JSON payloads (attendance logs, reports) shrink
// ~70% over the wire. Must precede the routes.
app.use(compression());

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'punchin-server', time: new Date().toISOString() });
});

// ---------- Routes ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/workers', require('./routes/workers'));
app.use('/api/sites', require('./routes/sites'));
app.use('/api/agencies', require('./routes/agencies'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/face', require('./routes/face'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/timesheets', require('./routes/timesheets'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/audit-logs', require('./routes/audit'));
app.use('/api/settings', require('./routes/settings'));
// Public v1 API — separate auth (x-api-key header) instead of JWT.
app.use('/v1', require('./routes/v1'));
// app.use('/api/payroll', require('./routes/payroll.routes'));
// app.use('/api/notifications', require('./routes/notification.routes'));

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  const http = require('http');
  const { Server } = require('socket.io');
  const connectDB = require('./config/db');
  const setupSocket = require('./config/socket');
  const reportScheduler = require('./services/reportScheduler');
  const aiScheduler = require('./services/aiScheduler');

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true },
  });
  app.set('io', io);
  setupSocket(io);

  connectDB()
    .then(() => {
      server.listen(PORT, () => {
        console.log(`[punchin] server listening on http://localhost:${PORT}`);
      });
      reportScheduler.start();
      aiScheduler.start();
    })
    .catch((err) => {
      console.error('[punchin] failed to start:', err);
      process.exit(1);
    });
}

module.exports = app;
