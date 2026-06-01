const crypto = require('crypto');
const axios = require('axios');

const Webhook = require('../models/Webhook');

const DELIVERY_TIMEOUT_MS = 5_000;

function sign(secret, body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

// Fire-and-forget delivery: finds active webhooks subscribed to `event` in the
// org and POSTs the payload to each. Failures are logged on the webhook doc
// but never thrown — webhook glitches must never break a clock-in.
async function deliver(event, orgId, payload) {
  if (!event || !orgId) return;
  try {
    const hooks = await Webhook.find({
      org_id: orgId,
      active: true,
      deletedAt: null,
      events: event,
    }).lean();
    if (hooks.length === 0) return;

    const body = JSON.stringify({
      event,
      orgId: String(orgId),
      timestamp: new Date().toISOString(),
      data: payload,
    });

    // Don't await — let HTTP calls run in parallel.
    for (const hook of hooks) {
      sendOne(hook, body).catch(() => {});
    }
  } catch (err) {
    console.error('[truein] webhook lookup failed:', err.message);
  }
}

async function sendOne(hook, body) {
  const signature = sign(hook.secret, body);
  const headers = {
    'Content-Type': 'application/json',
    'X-Truein-Signature': `sha256=${signature}`,
    'X-Truein-Webhook-Id': String(hook._id),
  };
  try {
    await axios.post(hook.url, body, { headers, timeout: DELIVERY_TIMEOUT_MS });
    await Webhook.updateOne(
      { _id: hook._id },
      { $set: { lastDeliveryAt: new Date(), lastError: '' }, $inc: { deliveryCount: 1 } }
    );
  } catch (err) {
    const msg = err.response
      ? `HTTP ${err.response.status}: ${err.message}`
      : err.message;
    await Webhook.updateOne(
      { _id: hook._id },
      { $set: { lastDeliveryAt: new Date(), lastError: msg } }
    );
    console.warn(`[truein] webhook delivery failed (${hook._id}):`, msg);
  }
}

module.exports = { deliver, sign };
