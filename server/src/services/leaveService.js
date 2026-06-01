const LeaveType = require('../models/LeaveType');
const LeaveBalance = require('../models/LeaveBalance');
const User = require('../models/User');

const MS_PER_DAY = 86_400_000;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function eachDay(from, to) {
  const out = [];
  const start = startOfDay(from);
  const end = startOfDay(to);
  for (let d = start; d <= end; d = new Date(d.getTime() + MS_PER_DAY)) {
    out.push(new Date(d));
  }
  return out;
}

function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

// Returns the set of overlapping blackout periods for the given LeaveType.
// A blackout overlaps a request if its [start, end] intersects [startDate, endDate].
function getBlackoutOverlaps(leaveType, startDate, endDate) {
  if (!leaveType?.blackoutPeriods?.length) return [];
  const rs = startOfDay(startDate).getTime();
  const re = startOfDay(endDate).getTime();
  return leaveType.blackoutPeriods.filter((b) => {
    const bs = startOfDay(b.start).getTime();
    const be = startOfDay(b.end).getTime();
    return bs <= re && be >= rs;
  });
}

async function checkBlackoutPeriods(orgId, leaveTypeId, startDate, endDate) {
  const lt = await LeaveType.findOne({ _id: leaveTypeId, org_id: orgId, deletedAt: null }).lean();
  if (!lt) return { ok: true, overlaps: [] };
  const overlaps = getBlackoutOverlaps(lt, startDate, endDate);
  return { ok: overlaps.length === 0, overlaps };
}

// Compute the number of leave days for a request. With sandwichPolicy enabled,
// weekends and holidays sandwiched between leave dates count as leave days.
// Without it, only working days (Mon-Fri, excluding holidays) count.
function applySandwichPolicy(startDate, endDate, holidays = [], { sandwich = false } = {}) {
  const days = eachDay(startDate, endDate);
  const holidaySet = new Set(holidays.map((h) => startOfDay(h).getTime()));

  let total = 0;
  for (const d of days) {
    const isHoliday = holidaySet.has(d.getTime());
    if (sandwich) {
      // Every calendar day counts.
      total += 1;
    } else if (!isWeekend(d) && !isHoliday) {
      total += 1;
    }
  }

  return {
    totalDays: total,
    calendarDays: days.length,
    sandwichApplied: sandwich,
  };
}

// Cron entrypoint: run on 1st of each month. For every leave type with
// accrualType='monthly', add (annualDays / 12) to every active worker's
// LeaveBalance for the current year, capped at annualDays for the year.
async function autoAllocateMonthlyAccrual({ orgId, year } = {}) {
  const ltFilter = { accrualType: 'monthly', deletedAt: null };
  if (orgId) ltFilter.org_id = orgId;
  const leaveTypes = await LeaveType.find(ltFilter).lean();
  const currentYear = year || new Date().getFullYear();

  const results = { processed: 0, accrued: 0, byType: [] };

  for (const lt of leaveTypes) {
    const monthly = (lt.annualDays || 0) / 12;
    if (monthly <= 0) continue;

    const workers = await User.find({
      org_id: lt.org_id,
      status: 'active',
      deletedAt: null,
      role: { $in: ['worker', 'supervisor'] },
    }, '_id').lean();

    const ops = workers.map((w) => ({
      updateOne: {
        filter: {
          org_id: lt.org_id,
          user_id: w._id,
          leaveType_id: lt._id,
          year: currentYear,
        },
        update: {
          $setOnInsert: {
            org_id: lt.org_id,
            user_id: w._id,
            leaveType_id: lt._id,
            year: currentYear,
            used: 0,
            carried: 0,
          },
          $inc: { allocated: monthly, balance: monthly },
        },
        upsert: true,
      },
    }));

    if (ops.length === 0) continue;
    const res = await LeaveBalance.bulkWrite(ops, { ordered: false });
    results.processed += workers.length;
    results.accrued += monthly * workers.length;
    results.byType.push({
      leaveTypeId: String(lt._id),
      name: lt.name,
      monthlyAccrual: monthly,
      workersUpdated: res.modifiedCount + (res.upsertedCount || 0),
    });
  }

  return results;
}

class LeaveError extends Error {
  constructor(message, { status = 400, code = 'LEAVE_ERROR', meta } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    if (meta) this.meta = meta;
  }
}

module.exports = {
  checkBlackoutPeriods,
  getBlackoutOverlaps,
  applySandwichPolicy,
  autoAllocateMonthlyAccrual,
  LeaveError,
  _internal: { startOfDay, eachDay, isWeekend },
};
