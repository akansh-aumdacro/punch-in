function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (allowedRoles.length && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden: insufficient role',
        required: allowedRoles,
        actual: req.user.role,
      });
    }
    next();
  };
}

module.exports = authorizeRoles;
module.exports.authorizeRoles = authorizeRoles;
