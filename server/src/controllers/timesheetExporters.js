const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { format } = require('date-fns');

// Shared row shape: each row has { name, employeeId, periodStart, periodEnd,
// totalHours, otHours, lateMinutes, leaveDays, lopDays, status, site, agency }

function fmtDate(d) {
  if (!d) return '';
  try { return format(new Date(d), 'yyyy-MM-dd'); } catch { return ''; }
}

function rowsFromTimesheets(timesheets) {
  return timesheets.map((t) => ({
    name: t.user_id?.name || '',
    employeeId: t.user_id?.employeeId || '',
    email: t.user_id?.email || '',
    site: t.user_id?.site_id?.name || '',
    agency: t.user_id?.agency_id?.name || '',
    periodStart: fmtDate(t.periodStart),
    periodEnd: fmtDate(t.periodEnd),
    totalHours: t.totalHours || 0,
    otHours: t.otHours || 0,
    lateMinutes: t.lateMinutes || 0,
    leaveDays: t.leaveDays || 0,
    lopDays: t.lopDays || 0,
    status: t.status || 'pending',
  }));
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ---------- CSV ----------

function exportCsv(res, timesheets) {
  const rows = rowsFromTimesheets(timesheets);
  const headers = [
    'Worker', 'Employee ID', 'Email', 'Site', 'Agency',
    'Period Start', 'Period End',
    'Total Hours', 'OT Hours', 'Late Minutes', 'Leave Days', 'LOP Days', 'Status',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.name, r.employeeId, r.email, r.site, r.agency,
      r.periodStart, r.periodEnd,
      r.totalHours, r.otHours, r.lateMinutes, r.leaveDays, r.lopDays, r.status,
    ].map(csvEscape).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="timesheets-${Date.now()}.csv"`);
  res.send(lines.join('\n'));
}

// ---------- XLSX ----------

async function exportXlsx(res, timesheets, org) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Truein';
  wb.created = new Date();
  const ws = wb.addWorksheet('Timesheets');

  ws.mergeCells('A1:M1');
  ws.getCell('A1').value = `${org?.name || 'Timesheets'} — Timesheet Export`;
  ws.getCell('A1').font = { size: 14, bold: true };
  ws.getCell('A1').alignment = { horizontal: 'center' };

  ws.getRow(2).values = [
    'Worker', 'Employee ID', 'Email', 'Site', 'Agency',
    'Period Start', 'Period End',
    'Total Hours', 'OT Hours', 'Late (min)', 'Leave Days', 'LOP Days', 'Status',
  ];
  ws.getRow(2).font = { bold: true };
  ws.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  const rows = rowsFromTimesheets(timesheets);
  for (const r of rows) {
    ws.addRow([
      r.name, r.employeeId, r.email, r.site, r.agency,
      r.periodStart, r.periodEnd,
      r.totalHours, r.otHours, r.lateMinutes, r.leaveDays, r.lopDays, r.status,
    ]);
  }

  // Summary row.
  const summary = rows.reduce(
    (acc, r) => ({
      totalHours: acc.totalHours + (r.totalHours || 0),
      otHours: acc.otHours + (r.otHours || 0),
      lateMinutes: acc.lateMinutes + (r.lateMinutes || 0),
      leaveDays: acc.leaveDays + (r.leaveDays || 0),
      lopDays: acc.lopDays + (r.lopDays || 0),
    }),
    { totalHours: 0, otHours: 0, lateMinutes: 0, leaveDays: 0, lopDays: 0 }
  );

  const sumRow = ws.addRow([
    'TOTAL', '', '', '', '', '', '',
    summary.totalHours, summary.otHours, summary.lateMinutes, summary.leaveDays, summary.lopDays, '',
  ]);
  sumRow.font = { bold: true };
  sumRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };

  ws.columns.forEach((col) => { col.width = 16; });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="timesheets-${Date.now()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

// ---------- PDF ----------

function exportPdf(res, timesheets, org) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="timesheets-${Date.now()}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text(org?.name || 'Truein', { align: 'left' });
  doc.fontSize(11).fillColor('#666').text(`Timesheet Export — ${format(new Date(), 'yyyy-MM-dd')}`);
  doc.moveDown(0.5);
  doc.fillColor('#000');

  const rows = rowsFromTimesheets(timesheets);
  const cols = [
    { key: 'name',         label: 'Worker',     w: 110 },
    { key: 'employeeId',   label: 'Emp ID',     w: 60 },
    { key: 'site',         label: 'Site',       w: 80 },
    { key: 'periodStart',  label: 'From',       w: 70 },
    { key: 'periodEnd',    label: 'To',         w: 70 },
    { key: 'totalHours',   label: 'Hours',      w: 50, align: 'right' },
    { key: 'otHours',      label: 'OT',         w: 40, align: 'right' },
    { key: 'lateMinutes',  label: 'Late(m)',    w: 55, align: 'right' },
    { key: 'leaveDays',    label: 'Leave',      w: 45, align: 'right' },
    { key: 'lopDays',      label: 'LOP',        w: 40, align: 'right' },
    { key: 'status',       label: 'Status',     w: 65 },
  ];

  const drawRow = (vals, opts = {}) => {
    const startY = doc.y;
    let x = doc.page.margins.left;
    doc.fontSize(opts.bold ? 10 : 9);
    if (opts.bold) doc.font('Helvetica-Bold'); else doc.font('Helvetica');
    cols.forEach((c, i) => {
      const txt = String(vals[i] ?? '');
      doc.text(txt, x + 2, startY + 4, { width: c.w - 4, align: c.align || 'left' });
      x += c.w;
    });
    doc.moveTo(doc.page.margins.left, startY + 16)
      .lineTo(doc.page.margins.left + cols.reduce((a, c) => a + c.w, 0), startY + 16)
      .strokeColor('#e5e7eb').stroke();
    doc.y = startY + 18;
  };

  drawRow(cols.map((c) => c.label), { bold: true });

  for (const r of rows) {
    if (doc.y > doc.page.height - 70) doc.addPage({ layout: 'landscape' });
    drawRow(cols.map((c) => r[c.key]));
  }

  doc.moveDown(0.5);
  const summary = rows.reduce(
    (acc, r) => ({
      totalHours: acc.totalHours + r.totalHours,
      otHours: acc.otHours + r.otHours,
      lateMinutes: acc.lateMinutes + r.lateMinutes,
      leaveDays: acc.leaveDays + r.leaveDays,
      lopDays: acc.lopDays + r.lopDays,
    }),
    { totalHours: 0, otHours: 0, lateMinutes: 0, leaveDays: 0, lopDays: 0 }
  );
  doc.font('Helvetica-Bold').fontSize(10).text(
    `TOTAL — Hours: ${summary.totalHours} · OT: ${summary.otHours} · ` +
    `Late: ${summary.lateMinutes}m · Leave: ${summary.leaveDays}d · LOP: ${summary.lopDays}d`,
    { align: 'right' }
  );

  doc.end();
}

// ---------- Payroll formats ----------

function exportAdp(res, timesheets) {
  // Stub of an ADP-compatible CSV. Real ADP imports vary; this is a starting
  // point with the most common columns. Pay codes are placeholder labels.
  const headers = [
    'Company Code', 'Batch ID', 'File #', 'Employee ID', 'Last Name', 'First Name',
    'Regular Hours', 'Overtime Hours', 'Pay Period Start', 'Pay Period End',
  ];
  const lines = [headers.join(',')];
  for (const t of timesheets) {
    const fullName = (t.user_id?.name || '').trim();
    const [firstName, ...rest] = fullName.split(' ');
    const lastName = rest.join(' ');
    lines.push([
      'COMP001',
      'BATCH001',
      t.user_id?.employeeId || '',
      t.user_id?.employeeId || String(t.user_id?._id || ''),
      lastName,
      firstName,
      Math.max(0, (t.totalHours || 0) - (t.otHours || 0)),
      t.otHours || 0,
      fmtDate(t.periodStart),
      fmtDate(t.periodEnd),
    ].map(csvEscape).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="adp-export-${Date.now()}.csv"`);
  res.send(lines.join('\n'));
}

function exportQuickBooks(res, timesheets) {
  // QuickBooks IIF-style CSV is heavy; this is the "weekly timesheet" CSV
  // shape QB Online Time Tracking accepts for import.
  const headers = [
    'Employee', 'Service Item', 'Customer:Job',
    'Pay Period Start', 'Pay Period End',
    'Regular Hrs', 'OT Hrs', 'Notes',
  ];
  const lines = [headers.join(',')];
  for (const t of timesheets) {
    lines.push([
      t.user_id?.name || '',
      'Hours Worked',
      t.user_id?.site_id?.name || '',
      fmtDate(t.periodStart),
      fmtDate(t.periodEnd),
      Math.max(0, (t.totalHours || 0) - (t.otHours || 0)),
      t.otHours || 0,
      `Status: ${t.status}`,
    ].map(csvEscape).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="quickbooks-export-${Date.now()}.csv"`);
  res.send(lines.join('\n'));
}

module.exports = {
  exportCsv,
  exportXlsx,
  exportPdf,
  exportAdp,
  exportQuickBooks,
};
