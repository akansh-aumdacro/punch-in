const Notification = require('../models/Notification');

exports.list = async (req, res, next) => {
  try {
    const filter = { org_id: req.user.orgId, user_id: req.user.userId, deletedAt: null };
    if (req.query.unread === 'true') filter.isRead = false;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const [items, total, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, isRead: false }),
    ]);

    res.json({
      items,
      unread,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
};

exports.markRead = async (req, res, next) => {
  try {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, user_id: req.user.userId, deletedAt: null },
      { isRead: true },
      { new: true }
    ).lean();
    if (!n) return res.status(404).json({ error: 'Notification not found' });
    res.json({ notification: n });
  } catch (err) {
    next(err);
  }
};

exports.markAllRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { org_id: req.user.orgId, user_id: req.user.userId, isRead: false, deletedAt: null },
      { isRead: true }
    );
    res.json({ updated: result.modifiedCount || 0 });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.id, org_id: req.user.orgId, user_id: req.user.userId, deletedAt: null },
      { deletedAt: new Date() },
      { new: true }
    ).lean();
    if (!n) return res.status(404).json({ error: 'Notification not found' });
    res.json({ notification: n });
  } catch (err) {
    next(err);
  }
};
