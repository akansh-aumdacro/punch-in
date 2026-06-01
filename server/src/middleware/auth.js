const jwt = require('jsonwebtoken');
const { getRedis } = require('../config/redis');

async function isBlacklisted(token) {
  try {
    const redis = getRedis();
    const exists = await redis.exists(`auth:blacklist:${token}`);
    return exists === 1;
  } catch {
    // Redis unavailable — skip blacklist check rather than failing requests.
    return false;
  }
}

async function verifyToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });
  }

  if (await isBlacklisted(token)) {
    return res.status(401).json({ error: 'Token revoked', code: 'TOKEN_REVOKED' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    req.token = token;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token', code: 'TOKEN_INVALID' });
    }
    return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_FAILED' });
  }
}

module.exports = verifyToken;
module.exports.verifyToken = verifyToken;
