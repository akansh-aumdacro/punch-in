const Redis = require('ioredis');

let client = null;

function getRedis() {
  if (client) return client;

  // Exponential backoff for reconnects, capped at 5s. Returning null from
  // retryStrategy here would mean "give up forever" — we always want to
  // recover from transient blips, so always return a number.
  const baseOpts = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy(times) {
      return Math.min(50 * 2 ** times, 5_000);
    },
    reconnectOnError(err) {
      // READONLY error after failover — drop the connection and reconnect.
      if (/READONLY/.test(err.message)) return 2;
      return false;
    },
  };

  const url = process.env.REDIS_URL;
  client = url
    ? new Redis(url, baseOpts)
    : new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        ...baseOpts,
      });

  client.on('connect', () => console.log('[truein] redis connected'));
  client.on('ready', () => console.log('[truein] redis ready'));
  client.on('error', (err) => console.error('[truein] redis error:', err.message));
  client.on('end', () => console.warn('[truein] redis connection ended'));
  client.on('reconnecting', (delay) => console.log(`[truein] redis reconnecting in ${delay}ms`));

  return client;
}

module.exports = { getRedis };
