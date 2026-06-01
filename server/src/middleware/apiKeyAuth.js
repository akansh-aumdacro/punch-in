const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

// Auth middleware for the public /v1/ API. Reads `x-api-key` header, looks up
// the hashed key, attaches { org_id, scopes } to req as `req.apiKey` and a
// minimal `req.user` so controllers that reuse JWT helpers still work.
async function apiKeyAuth(req, res, next) {
  try {
    const raw = req.headers['x-api-key'] || req.headers['authorization']?.replace(/^ApiKey\s+/i, '');
    if (!raw) {
      return res.status(401).json({ error: 'Missing x-api-key header', code: 'NO_API_KEY' });
    }
    const keyHash = hashKey(raw);
    const key = await ApiKey.findOne({ keyHash, deletedAt: null });
    if (!key || key.revokedAt) {
      return res.status(401).json({ error: 'Invalid or revoked API key', code: 'BAD_API_KEY' });
    }

    // Fire-and-forget update so request latency isn't blocked on this write.
    ApiKey.updateOne({ _id: key._id }, { lastUsedAt: new Date() }).catch(() => {});

    req.apiKey = key;
    req.user = {
      orgId: String(key.org_id),
      role: 'api',
      userId: null,
      scopes: key.scopes || [],
    };
    next();
  } catch (err) {
    next(err);
  }
}

function requireScope(scope) {
  return (req, res, next) => {
    const scopes = req.user?.scopes || [];
    if (scope && !scopes.includes(scope)) {
      return res.status(403).json({ error: `Missing scope: ${scope}`, code: 'INSUFFICIENT_SCOPE' });
    }
    next();
  };
}

module.exports = apiKeyAuth;
module.exports.apiKeyAuth = apiKeyAuth;
module.exports.requireScope = requireScope;
module.exports.hashKey = hashKey;
