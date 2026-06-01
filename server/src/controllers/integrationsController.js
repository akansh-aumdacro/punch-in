const mongoose = require('mongoose');

const Timesheet = require('../models/Timesheet');
const User = require('../models/User');
const payroll = require('../services/payrollExport');

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d) {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  return x;
}

exports.exportPayroll = async (req, res, next) => {
  try {
    const { format: fmt, periodStart, periodEnd, siteId, agencyId } = req.body;
    if (!fmt || !['adp', 'quickbooks', 'generic'].includes(fmt)) {
      return res.status(400).json({ error: 'format must be adp|quickbooks|generic' });
    }
    if (!periodStart || !periodEnd) {
      return res.status(400).json({ error: 'periodStart and periodEnd are required' });
    }

    const from = startOfDay(new Date(periodStart));
    const to = endOfDay(new Date(periodEnd));

    const filter = {
      org_id: req.user.orgId,
      deletedAt: null,
      periodStart: { $gte: from },
      periodEnd: { $lte: to },
    };

    // Pre-filter on User if scope is specified — the same pattern used in
    // timesheetController.buildFilter.
    if (siteId || agencyId) {
      const userFilter = { org_id: req.user.orgId, deletedAt: null };
      if (siteId && mongoose.isValidObjectId(siteId)) userFilter.site_id = siteId;
      if (agencyId && mongoose.isValidObjectId(agencyId)) userFilter.agency_id = agencyId;
      const users = await User.find(userFilter, '_id').lean();
      filter.user_id = { $in: users.map((u) => u._id) };
    }

    const timesheets = await Timesheet.find(filter)
      .populate({
        path: 'user_id',
        select: 'name email employeeId site_id agency_id',
        populate: [
          { path: 'site_id', select: 'name' },
          { path: 'agency_id', select: 'name' },
        ],
      })
      .sort({ periodStart: -1 })
      .limit(10_000)
      .lean();

    let csv;
    if (fmt === 'adp') csv = payroll.toADPFormat(timesheets);
    else if (fmt === 'quickbooks') csv = payroll.toQuickBooksFormat(timesheets);
    else csv = payroll.toGenericFormat(timesheets);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="payroll-${fmt}-${Date.now()}.csv"`
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
};
