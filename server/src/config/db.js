const mongoose = require('mongoose');

const DEFAULT_OPTS = {
  // Production-friendly tuning. Pool size is conservative — bump if you see
  // `MongooseServerSelectionError` under load.
  maxPoolSize: 50,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
  family: 4, // IPv4 first; avoids slow IPv6 lookup in some Docker setups
};

async function connectDB() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    console.log('[truein] mongo connected:', mongoose.connection.host);
  });
  mongoose.connection.on('error', (err) => {
    console.error('[truein] mongo connection error:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[truein] mongo disconnected — driver will retry automatically');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('[truein] mongo reconnected');
  });

  // Connect once. The Node.js driver handles automatic reconnects on
  // transient network issues; retryWrites/retryReads default to true on
  // recent versions, so writes survive primary failovers.
  await mongoose.connect(uri, DEFAULT_OPTS);
  return mongoose.connection;
}

module.exports = connectDB;
