const cron = require('node-cron');
const nodemailer = require('nodemailer');

const ScheduledReport = require('../models/ScheduledReport');
const Organization = require('../models/Organization');
const reportGenerator = require('./reportGenerator');
const reportExporters = require('./reportExporters');

let transporter = null;
let started = false;

function makeTransporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

function computeNextRun(frequency, anchor = new Date()) {
  const next = new Date(anchor);
  if (frequency === 'daily') next.setDate(next.getDate() + 1);
  else if (frequency === 'weekly') next.setDate(next.getDate() + 7);
  else if (frequency === 'monthly') next.setMonth(next.getMonth() + 1);
  else next.setDate(next.getDate() + 1);
  // Reset to 06:00 local so emails land at a predictable hour.
  next.setHours(6, 0, 0, 0);
  return next;
}

async function runOne(sched) {
  const org = await Organization.findById(sched.org_id).lean();
  const result = await reportGenerator.generate(sched.reportType, sched.org_id, sched.filters || {});
  const attachment = await reportExporters.toBuffer(result, sched.format, { orgName: org?.name });

  if (!transporter) {
    throw new Error('SMTP not configured (set SMTP_HOST in env)');
  }

  const recipients = (sched.recipients || []).filter(Boolean).join(',');
  if (!recipients) throw new Error('No recipients on schedule');

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Truein <no-reply@truein.app>',
    to: recipients,
    subject: `[Truein] ${result.title} — ${new Date().toISOString().slice(0, 10)}`,
    text: `Your scheduled ${result.title} report is attached.\n\n` +
      `Period: ${JSON.stringify(result.period)}\n` +
      `Rows: ${result.rows.length}`,
    attachments: [{
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType,
    }],
  });
}

async function runDueReports() {
  if (!transporter) transporter = makeTransporter();

  const now = new Date();
  const due = await ScheduledReport.find({
    active: true,
    deletedAt: null,
    nextRunAt: { $lte: now },
  });

  for (const sched of due) {
    try {
      if (!transporter) {
        // No SMTP yet — push nextRunAt forward by 1h so we retry without
        // spinning, but log loudly so it's clear why nothing is going out.
        console.warn('[truein] scheduled report skipped — SMTP not configured');
        sched.nextRunAt = new Date(Date.now() + 60 * 60 * 1000);
        sched.lastError = 'SMTP not configured';
        await sched.save();
        continue;
      }
      await runOne(sched);
      sched.lastRunAt = new Date();
      sched.nextRunAt = computeNextRun(sched.frequency, sched.lastRunAt);
      sched.lastError = '';
      await sched.save();
      console.log(`[truein] scheduled report sent: ${sched.reportType} → ${sched.recipients.join(',')}`);
    } catch (err) {
      sched.lastError = err.message || 'Unknown error';
      // Retry in one hour instead of looping immediately.
      sched.nextRunAt = new Date(Date.now() + 60 * 60 * 1000);
      await sched.save();
      console.error(`[truein] scheduled report failed (${sched._id}):`, err.message);
    }
  }
}

function start() {
  if (started) return;
  started = true;
  transporter = makeTransporter();

  // Hourly tick at minute 0.
  cron.schedule('0 * * * *', () => {
    runDueReports().catch((err) => console.error('[truein] scheduler tick failed:', err.message));
  });
  console.log(
    transporter
      ? '[truein] report scheduler started (hourly tick)'
      : '[truein] report scheduler started, SMTP not configured — reports will queue but not send'
  );
}

module.exports = { start, runDueReports, runOne, computeNextRun };
