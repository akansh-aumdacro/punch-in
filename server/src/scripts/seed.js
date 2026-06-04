/* eslint-disable no-console */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const connectDB = require('../config/db');
const Organization = require('../models/Organization');
const User = require('../models/User');
const Site = require('../models/Site');
const Shift = require('../models/Shift');
const LeaveType = require('../models/LeaveType');
const LeaveBalance = require('../models/LeaveBalance');
const AttendanceLog = require('../models/AttendanceLog');
const Timesheet = require('../models/Timesheet');

const ORG_NAME = 'PunchIn Demo';
const ADMIN_EMAIL = 'admin@truein.demo';
const ADMIN_PASS = 'admin1234';

const MS_PER_DAY = 86_400_000;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function eachDay(from, to) {
  const out = [];
  for (let d = startOfDay(from); d <= startOfDay(to); d = new Date(d.getTime() + MS_PER_DAY)) {
    out.push(new Date(d));
  }
  return out;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function hash(p) {
  return bcrypt.hash(p, 10);
}

async function run() {
  await connectDB();
  console.log('--- PunchIn seed ---');

  // Drop existing demo org (and everything inside it).
  const existing = await Organization.findOne({ name: ORG_NAME });
  if (existing) {
    console.log(`Removing existing "${ORG_NAME}" org and dependent data…`);
    const orgId = existing._id;
    await Promise.all([
      User.deleteMany({ org_id: orgId }),
      Site.deleteMany({ org_id: orgId }),
      Shift.deleteMany({ org_id: orgId }),
      LeaveType.deleteMany({ org_id: orgId }),
      LeaveBalance.deleteMany({ org_id: orgId }),
      AttendanceLog.deleteMany({ org_id: orgId }),
      Timesheet.deleteMany({ org_id: orgId }),
    ]);
    await Organization.deleteOne({ _id: orgId });
  }

  // 1. Organization
  const org = await Organization.create({
    name: ORG_NAME,
    timezone: 'Asia/Kolkata',
    country: 'IN',
    currency: 'INR',
    settings: {
      hourlyRate: 250,
      otMultiplier: 1.5,
      standardDayHours: 8,
      fiscalYearStart: '04-01',
    },
  });
  console.log('Org:', org.name);

  // 2. Sites
  const sites = await Site.create([
    {
      org_id: org._id, name: 'Bangalore HQ',
      address: 'Indiranagar, Bangalore',
      lat: 12.9719, lng: 77.6412, radiusMeters: 150, geofenceEnabled: true,
      timezone: 'Asia/Kolkata',
    },
    {
      org_id: org._id, name: 'Mumbai Warehouse',
      address: 'Andheri East, Mumbai',
      lat: 19.1136, lng: 72.8697, radiusMeters: 200, geofenceEnabled: true,
      timezone: 'Asia/Kolkata',
    },
    {
      org_id: org._id, name: 'Pune Factory',
      address: 'Hinjewadi, Pune',
      lat: 18.5912, lng: 73.7388, radiusMeters: 250, geofenceEnabled: true,
      timezone: 'Asia/Kolkata',
    },
  ]);
  console.log(`Created ${sites.length} sites`);

  // 3. Shift templates
  const shifts = await Shift.create([
    {
      org_id: org._id, name: 'Morning',
      startTime: '09:00', endTime: '17:00',
      breakMinutes: 30, daysOfWeek: [1, 2, 3, 4, 5],
      type: 'fixed', gracePeriodMinutes: 10,
    },
    {
      org_id: org._id, name: 'Evening',
      startTime: '14:00', endTime: '22:00',
      breakMinutes: 30, daysOfWeek: [1, 2, 3, 4, 5],
      type: 'fixed', gracePeriodMinutes: 10,
    },
    {
      org_id: org._id, name: 'Night',
      startTime: '22:00', endTime: '06:00',
      breakMinutes: 60, daysOfWeek: [1, 2, 3, 4, 5],
      type: 'rotating', gracePeriodMinutes: 15,
    },
  ]);
  console.log(`Created ${shifts.length} shifts`);

  // 4. Users — superadmin + HR + 2 supervisors + 10 workers
  const passwordHash = await hash(ADMIN_PASS);

  const superadmin = await User.create({
    org_id: org._id, role: 'superadmin',
    email: ADMIN_EMAIL, passwordHash,
    name: 'Demo Admin', status: 'active',
  });

  const hr = await User.create({
    org_id: org._id, role: 'hr',
    email: 'hr@truein.demo', passwordHash,
    name: 'HR Manager', status: 'active',
  });

  const supervisors = await User.create([
    {
      org_id: org._id, role: 'supervisor',
      email: 'supervisor.bangalore@truein.demo', passwordHash,
      name: 'Anita Rao', site_id: sites[0]._id, status: 'active',
    },
    {
      org_id: org._id, role: 'supervisor',
      email: 'supervisor.mumbai@truein.demo', passwordHash,
      name: 'Ravi Kumar', site_id: sites[1]._id, status: 'active',
    },
  ]);

  const workerSpecs = [
    { name: 'Priya Sharma',  category: 'permanent',     site: 0, shift: 0 },
    { name: 'Arjun Mehta',   category: 'permanent',     site: 0, shift: 0 },
    { name: 'Neha Verma',    category: 'permanent',     site: 0, shift: 1 },
    { name: 'Vikram Singh',  category: 'contract',      site: 1, shift: 0 },
    { name: 'Sneha Iyer',    category: 'contract',      site: 1, shift: 0 },
    { name: 'Rohit Das',     category: 'contract',      site: 1, shift: 1 },
    { name: 'Pooja Nair',    category: 'permanent',     site: 2, shift: 0 },
    { name: 'Karan Joshi',   category: 'temporary',     site: 2, shift: 1 },
    { name: 'Meera Pillai',  category: 'subcontractor', site: 2, shift: 2 },
    { name: 'Tarun Bose',    category: 'contract',      site: 2, shift: 2 },
  ];

  const workers = await User.create(
    workerSpecs.map((w, i) => ({
      org_id: org._id,
      role: 'worker',
      email: `${w.name.toLowerCase().replace(/\s+/g, '.')}@truein.demo`,
      passwordHash,
      name: w.name,
      employeeId: `EMP${String(1001 + i).padStart(5, '0')}`,
      department: i % 2 === 0 ? 'Operations' : 'Logistics',
      category: w.category,
      site_id: sites[w.site]._id,
      shift_id: shifts[w.shift]._id,
      status: 'active',
    }))
  );
  console.log(`Created ${1 + 1 + supervisors.length + workers.length} users`);

  // 5. Leave types + balances
  const leaveTypes = await LeaveType.create([
    {
      org_id: org._id, name: 'Annual Leave', isPaid: true,
      annualDays: 12, carryForwardMax: 5, sandwichPolicy: false,
      accrualType: 'yearly', advanceNoticeDays: 2, color: '#10b981',
    },
    {
      org_id: org._id, name: 'Sick Leave', isPaid: true,
      annualDays: 8, carryForwardMax: 0, sandwichPolicy: false,
      accrualType: 'yearly', advanceNoticeDays: 0, color: '#f59e0b',
    },
    {
      org_id: org._id, name: 'Casual Leave', isPaid: true,
      annualDays: 6, carryForwardMax: 0, sandwichPolicy: true,
      accrualType: 'yearly', advanceNoticeDays: 1, color: '#0ea5e9',
    },
  ]);
  console.log(`Created ${leaveTypes.length} leave types`);

  const year = new Date().getFullYear();
  const balanceDocs = [];
  for (const w of workers.concat(supervisors)) {
    for (const lt of leaveTypes) {
      balanceDocs.push({
        org_id: org._id,
        user_id: w._id,
        leaveType_id: lt._id,
        year,
        allocated: lt.annualDays,
        used: 0,
        carried: 0,
        balance: lt.annualDays,
      });
    }
  }
  await LeaveBalance.insertMany(balanceDocs);
  console.log(`Allocated ${balanceDocs.length} leave balances`);

  // 6. 30 days of attendance + per-day variety
  const today = startOfDay(new Date());
  const start = new Date(today.getTime() - 30 * MS_PER_DAY);
  const days = eachDay(start, today);

  const logsToInsert = [];
  for (const w of workers) {
    const shift = shifts.find((s) => String(s._id) === String(w.shift_id));
    const [startH, startM] = shift.startTime.split(':').map(Number);
    const [endH, endM] = shift.endTime.split(':').map(Number);

    for (const day of days) {
      const dow = day.getDay();
      // Weekends → 70% absent, 30% no log.
      if (dow === 0 || dow === 6) {
        if (Math.random() < 0.3) continue;
        logsToInsert.push({
          org_id: org._id, user_id: w._id, site_id: w.site_id,
          date: day, status: 'absent', approvalStatus: 'approved',
        });
        continue;
      }

      // 8% absent
      if (Math.random() < 0.08) {
        logsToInsert.push({
          org_id: org._id, user_id: w._id, site_id: w.site_id,
          date: day, status: 'absent', approvalStatus: 'approved',
          anomalyFlags: ['no_clock_in'],
        });
        continue;
      }

      // 5% sick leave (creates a leave row, not attendance)
      if (Math.random() < 0.05) {
        logsToInsert.push({
          org_id: org._id, user_id: w._id, site_id: w.site_id,
          date: day, status: 'leave', approvalStatus: 'approved',
        });
        continue;
      }

      // Normal attendance — jitter clock-in around shift start ±20 min.
      const jitterMin = Math.floor((Math.random() - 0.4) * 40);
      const clockIn = new Date(day);
      clockIn.setHours(startH, startM + jitterMin, 0, 0);

      // Late = beyond grace.
      const lateMinutes = Math.max(0, jitterMin);
      const flags = [];
      if (lateMinutes > shift.gracePeriodMinutes) flags.push('late');

      // ~85% clock out; rest leave the punch open.
      let clockOut = null;
      let workedMin = 0;
      let otMin = 0;
      if (Math.random() < 0.85) {
        clockOut = new Date(day);
        clockOut.setHours(endH, endM + Math.floor(Math.random() * 60), 0, 0);
        if (endH < startH) clockOut.setDate(clockOut.getDate() + 1); // overnight
        workedMin = Math.floor((clockOut - clockIn) / 60_000) - (shift.breakMinutes || 0);
        const standardMin = (endH * 60 + endM) - (startH * 60 + startM) - (shift.breakMinutes || 0);
        otMin = Math.max(0, workedMin - standardMin);
        if (otMin > 0) flags.push('overtime');
      } else {
        flags.push('no_clockout_gps');
      }

      logsToInsert.push({
        org_id: org._id,
        user_id: w._id,
        site_id: w.site_id,
        date: day,
        clockIn,
        clockOut,
        clockInMethod: 'face',
        clockInLat: 12.97 + Math.random() * 0.01,
        clockInLng: 77.64 + Math.random() * 0.01,
        gpsVerified: true,
        faceMatchScore: Math.random() < 0.95 ? 0.85 + Math.random() * 0.14 : 0.55 + Math.random() * 0.1,
        workedMinutes: workedMin,
        overtimeMinutes: otMin,
        lateMinutes,
        anomalyFlags: flags,
        status: 'present',
        approvalStatus: 'approved',
        deviceId: `device_${w.employeeId}`,
      });
    }
  }
  await AttendanceLog.insertMany(logsToInsert, { ordered: false });
  console.log(`Inserted ${logsToInsert.length} attendance logs`);

  // 7. Last week's timesheets per worker
  const weekStart = new Date(today.getTime() - 7 * MS_PER_DAY);
  const weekEnd = new Date(today.getTime() - 1 * MS_PER_DAY);
  const tsDocs = [];
  for (const w of workers) {
    const weekLogs = logsToInsert.filter(
      (l) =>
        String(l.user_id) === String(w._id) &&
        l.date >= weekStart && l.date <= weekEnd
    );
    const totalMin = weekLogs.reduce((s, l) => s + (l.workedMinutes || 0), 0);
    const otMin = weekLogs.reduce((s, l) => s + (l.overtimeMinutes || 0), 0);
    const lateMin = weekLogs.reduce((s, l) => s + (l.lateMinutes || 0), 0);
    const leaveDays = weekLogs.filter((l) => l.status === 'leave').length;
    const lopDays = weekLogs.filter((l) => l.status === 'absent').length;

    tsDocs.push({
      org_id: org._id, user_id: w._id,
      periodStart: weekStart, periodEnd: weekEnd,
      totalHours: Math.round((totalMin / 60) * 100) / 100,
      otHours: Math.round((otMin / 60) * 100) / 100,
      lateMinutes: lateMin,
      leaveDays, lopDays,
      status: 'pending',
    });
  }
  await Timesheet.insertMany(tsDocs);
  console.log(`Inserted ${tsDocs.length} weekly timesheets (status=pending)`);

  console.log('\n=== Seed complete ===');
  console.log(`Org:      ${ORG_NAME}`);
  console.log('Login:    http://localhost (or http://localhost:5173 in dev)');
  console.log(`Email:    ${ADMIN_EMAIL}`);
  console.log(`Password: ${ADMIN_PASS}`);
  console.log('\nAlternative logins (same password):');
  console.log('  hr@truein.demo');
  console.log('  supervisor.bangalore@truein.demo');
  console.log('  priya.sharma@truein.demo  (worker)');
  console.log('\nChange admin password immediately in production.');

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
