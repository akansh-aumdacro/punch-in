// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const payload = {
    error: err.message || 'Internal Server Error',
  };
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    payload.stack = err.stack;
  }
  if (err.errors) payload.errors = err.errors;

  console.error(`[punchin] ${status} ${req.method} ${req.originalUrl}:`, err.message);
  res.status(status).json(payload);
}

module.exports = errorHandler;
