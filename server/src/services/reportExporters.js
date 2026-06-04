const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { format: fmtDate } = require('date-fns');

// Each exporter takes a `result` (from reportGenerator) and either:
// (a) writes to an Express response (`res`) for HTTP downloads, or
// (b) returns a Buffer + filename via `toBuffer()` for email attachments.

function fmt(value, fmtType) {
  if (value == null || value === '') return '';
  if (fmtType === 'time') {
    try { return fmtDate(new Date(value), 'HH:mm'); } catch { return ''; }
  }
  if (value instanceof Date) {
    try { return fmtDate(value, 'yyyy-MM-dd'); } catch { return ''; }
  }
  return value;
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(result) {
  const headers = result.columns.map((c) => c.label);
  const lines = [headers.join(',')];
  for (const row of result.rows) {
    lines.push(
      result.columns
        .map((c) => csvEscape(fmt(row[c.key], c.format)))
        .join(',')
    );
  }
  return lines.join('\n');
}

function exportCsv(res, result, { filename }) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename || 'report.csv'}"`);
  res.send(buildCsv(result));
}

// ---------- XLSX ----------

async function buildXlsxWorkbook(result, { orgName } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PunchIn';
  wb.created = new Date();
  const ws = wb.addWorksheet('Report');

  const colCount = result.columns.length;

  // Title row.
  ws.mergeCells(1, 1, 1, colCount);
  ws.getCell(1, 1).value = `${orgName || 'PunchIn'} — ${result.title}`;
  ws.getCell(1, 1).font = { size: 14, bold: true, color: { argb: 'FF0F172A' } };
  ws.getCell(1, 1).alignment = { horizontal: 'center' };
  ws.getRow(1).height = 22;

  // Filters / period row.
  ws.mergeCells(2, 1, 2, colCount);
  const periodStr = formatPeriod(result.period);
  const filterStr = formatFilters(result.filters);
  ws.getCell(2, 1).value = [periodStr, filterStr].filter(Boolean).join(' · ');
  ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF64748B' } };
  ws.getCell(2, 1).alignment = { horizontal: 'center' };

  // Header row.
  const headerRow = ws.getRow(4);
  result.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    cell.alignment = { horizontal: c.align === 'right' ? 'right' : 'left' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF334155' } } };
  });
  headerRow.height = 18;

  // Data rows with alternating fill.
  result.rows.forEach((row, i) => {
    const r = ws.getRow(i + 5);
    result.columns.forEach((c, j) => {
      const cell = r.getCell(j + 1);
      cell.value = fmt(row[c.key], c.format);
      cell.alignment = { horizontal: c.align === 'right' ? 'right' : 'left' };
      if (i % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
  });

  // Summary row.
  if (result.summary && Object.keys(result.summary).length) {
    const summaryRowIdx = result.rows.length + 6;
    ws.mergeCells(summaryRowIdx, 1, summaryRowIdx, colCount);
    ws.getCell(summaryRowIdx, 1).value = `Summary: ${Object.entries(result.summary)
      .filter(([k]) => k !== 'flagCounts')
      .map(([k, v]) => `${k}=${typeof v === 'number' ? Math.round(v * 100) / 100 : v}`)
      .join(' · ')}`;
    ws.getCell(summaryRowIdx, 1).font = { bold: true, color: { argb: 'FF0F172A' } };
    ws.getCell(summaryRowIdx, 1).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' },
    };
  }

  // Auto column widths (rough).
  ws.columns.forEach((col, i) => {
    const colKey = result.columns[i]?.key;
    const maxLen = Math.max(
      result.columns[i]?.label?.length || 8,
      ...result.rows.map((r) => String(fmt(r[colKey], result.columns[i]?.format) || '').length),
    );
    col.width = Math.min(40, Math.max(10, maxLen + 2));
  });

  return wb;
}

async function exportXlsx(res, result, { filename, orgName }) {
  const wb = await buildXlsxWorkbook(result, { orgName });
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename || 'report.xlsx'}"`);
  await wb.xlsx.write(res);
  res.end();
}

// ---------- PDF ----------

function exportPdf(res, result, { filename, orgName }) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename || 'report.pdf'}"`);
  writePdf(result, { orgName, target: res });
}

function writePdf(result, { orgName, target }) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape', bufferPages: true });
  doc.pipe(target);

  // Header.
  doc.fontSize(16).fillColor('#0f172a').text(orgName || 'PunchIn', { continued: false });
  doc.fontSize(11).fillColor('#475569').text(result.title);
  const period = formatPeriod(result.period);
  const filters = formatFilters(result.filters);
  if (period || filters) {
    doc.fontSize(9).fillColor('#94a3b8').text([period, filters].filter(Boolean).join(' · '));
  }
  doc.moveDown(0.5);
  doc.fillColor('#000');

  // Table.
  const cols = result.columns.map((c) => ({
    key: c.key, label: c.label, align: c.align, format: c.format,
    w: estimateColWidth(c, result),
  }));
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const scale = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / totalW;
  cols.forEach((c) => { c.w *= scale; });

  const drawRow = (vals, opts = {}) => {
    const startY = doc.y;
    let x = doc.page.margins.left;
    doc.fontSize(opts.bold ? 9 : 8);
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
    cols.forEach((c, i) => {
      const txt = String(vals[i] ?? '');
      doc.text(txt, x + 2, startY + 4, { width: c.w - 4, align: c.align || 'left', lineBreak: false });
      x += c.w;
    });
    doc.moveTo(doc.page.margins.left, startY + 14)
      .lineTo(doc.page.margins.left + cols.reduce((a, c) => a + c.w, 0), startY + 14)
      .strokeColor('#e2e8f0').stroke();
    doc.y = startY + 16;
  };

  drawRow(cols.map((c) => c.label), { bold: true });
  for (const row of result.rows) {
    if (doc.y > doc.page.height - 70) doc.addPage({ layout: 'landscape' });
    drawRow(cols.map((c) => fmt(row[c.key], c.format)));
  }

  // Summary footer.
  if (result.summary && Object.keys(result.summary).length) {
    doc.moveDown(0.4);
    const summary = Object.entries(result.summary)
      .filter(([k]) => k !== 'flagCounts')
      .map(([k, v]) => `${k}: ${typeof v === 'number' ? Math.round(v * 100) / 100 : v}`)
      .join(' · ');
    doc.font('Helvetica-Bold').fontSize(9).text(`Summary — ${summary}`, { align: 'right' });
  }

  // Page numbers.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(
      `Page ${i - range.start + 1} of ${range.count}`,
      doc.page.margins.left,
      doc.page.height - 30,
      { align: 'right' }
    );
  }

  doc.end();
}

function estimateColWidth(col, result) {
  const headerLen = (col.label || '').length;
  const maxBody = result.rows.slice(0, 50).reduce((max, r) => {
    const v = String(fmt(r[col.key], col.format) || '');
    return Math.max(max, v.length);
  }, 0);
  return Math.max(headerLen, maxBody, 6) * 5.5;
}

function formatPeriod(period) {
  if (!period) return '';
  if (period.date) return `Date: ${period.date}`;
  if (period.from && period.to) return `${period.from} → ${period.to}`;
  if (period.year) return `Year: ${period.year}`;
  return '';
}

function formatFilters(filters) {
  if (!filters) return '';
  return Object.entries(filters)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ');
}

// ---------- Buffer (used by the cron emailer) ----------

async function toBuffer(result, format, { orgName } = {}) {
  if (format === 'csv') {
    return {
      filename: `${result.type}.csv`,
      contentType: 'text/csv',
      content: Buffer.from(buildCsv(result), 'utf8'),
    };
  }
  if (format === 'xlsx') {
    const wb = await buildXlsxWorkbook(result, { orgName });
    const buf = await wb.xlsx.writeBuffer();
    return {
      filename: `${result.type}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content: Buffer.from(buf),
    };
  }
  if (format === 'pdf') {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const sink = {
        write: (chunk) => chunks.push(chunk),
        end: () => {
          resolve({
            filename: `${result.type}.pdf`,
            contentType: 'application/pdf',
            content: Buffer.concat(chunks),
          });
        },
        on: () => {},
        once: () => {},
        emit: () => {},
      };
      try {
        writePdf(result, { orgName, target: sink });
      } catch (err) {
        reject(err);
      }
    });
  }
  throw new Error(`Unsupported export format: ${format}`);
}

module.exports = { exportCsv, exportXlsx, exportPdf, toBuffer };
