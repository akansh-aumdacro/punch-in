const Notification = require('../models/Notification');
const { emitToUser } = require('./socketBus');

// Single-recipient notification. Persists then emits 'notification:new' to
// the recipient's user-room (set up in config/socket.js) so the bell can
// refresh without polling.
async function notify({ orgId, userId, type, title, message, link, metadata }) {
  if (!orgId || !userId || !title) return null;
  try {
    const doc = await Notification.create({
      org_id: orgId,
      user_id: userId,
      type: type || 'system',
      title,
      message: message || '',
      link: link || '',
      metadata: metadata || {},
    });
    emitToUser('notification:new', String(userId), {
      id: String(doc._id),
      type: doc.type,
      title: doc.title,
      message: doc.message,
      link: doc.link,
      createdAt: doc.createdAt,
    });
    return doc;
  } catch (err) {
    // Notifications are non-critical — never let a delivery failure break
    // the underlying business action.
    console.error('[punchin] notification failed:', err.message);
    return null;
  }
}

// Fan-out: create a notification for each userId in the list.
async function notifyMany({ orgId, userIds, type, title, message, link, metadata }) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const out = [];
  for (const uid of userIds) {
    out.push(await notify({ orgId, userId: uid, type, title, message, link, metadata }));
  }
  return out;
}

module.exports = { notify, notifyMany };
