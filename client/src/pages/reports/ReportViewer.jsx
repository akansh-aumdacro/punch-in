import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Play, Download, FileText, FileSpreadsheet, FileType2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { reportsApi, downloadBlob } from '../../api/reports';
import { sitesApi } from '../../api/sites';
import { workersApi } from '../../api/workers';
import { SkeletonCard, SkeletonRow, ErrorBox } from '../../components/Skeleton.jsx';
import ReportChart from './ReportChart.jsx';

export default function ReportViewer({ report }) {
  // Filters for the currently-selected report. Reset whenever report changes.
  const [filters, setFilters] = useState(report.defaultFilters);

  useEffect(() => {
    setFilters(report.defaultFilters);
  }, [report.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const sitesQuery = useQuery({ queryKey: ['sites'], queryFn: () => sitesApi.list() });
  const workersQuery = useQuery({
    queryKey: ['workers', 'for-report'],
    queryFn: () => workersApi.list({ limit: 200 }),
    enabled: report.filterFields.includes('worker'),
  });

  // Manual fetch: only run after "Generate" button is clicked to avoid
  // accidental heavy queries when scrolling through the report list.
  const [runKey, setRunKey] = useState(0);
  const reportQuery = useQuery({
    queryKey: ['reports', report.key, filters, runKey],
    queryFn: () => reportsApi.fetch(report.key, filters),
    enabled: runKey > 0,
    staleTime: 30_000,
  });

  const handleExport = async (fmt) => {
    try {
      const res = await reportsApi.exportFile(report.key, fmt, filters);
      const ts = format(new Date(), 'yyyyMMdd-HHmm');
      const exts = { csv: 'csv', xlsx: 'xlsx', pdf: 'pdf' };
      downloadBlob(res.data, `${report.key}-${ts}.${exts[fmt]}`);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Export failed');
    }
  };

  return (
    <div className="flex-1 min-w-0">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">{report.label}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{report.chartHint}</p>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
        {report.filterFields.includes('date') && (
          <Field label="Date">
            <input
              type="date"
              value={filters.date || ''}
              onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value }))}
              className={inputCls}
            />
          </Field>
        )}
        {report.filterFields.includes('range') && (
          <>
            <Field label="From">
              <input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
                className={inputCls}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </>
        )}
        {report.filterFields.includes('year') && (
          <Field label="Year">
            <input
              type="number"
              value={filters.year || ''}
              onChange={(e) => setFilters((f) => ({ ...f, year: Number(e.target.value) }))}
              className={inputCls}
            />
          </Field>
        )}
        {report.filterFields.includes('site') && (
          <Field label="Site">
            <select
              value={filters.siteId || ''}
              onChange={(e) => setFilters((f) => ({ ...f, siteId: e.target.value || undefined }))}
              className={`${inputCls} bg-white`}
            >
              <option value="">All sites</option>
              {(sitesQuery.data?.items || []).map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </Field>
        )}
        {report.filterFields.includes('worker') && (
          <Field label="Worker">
            <select
              value={filters.workerId || ''}
              onChange={(e) => setFilters((f) => ({ ...f, workerId: e.target.value || undefined }))}
              className={`${inputCls} bg-white`}
            >
              <option value="">All</option>
              {(workersQuery.data?.items || []).map((w) => (
                <option key={w._id} value={w._id}>{w.name} ({w.employeeId || w.email})</option>
              ))}
            </select>
          </Field>
        )}
        {report.filterFields.includes('threshold') && (
          <Field label="Threshold (%)">
            <input
              type="number"
              min="0"
              max="100"
              value={Math.round((filters.threshold || 0) * 100)}
              onChange={(e) => setFilters((f) => ({ ...f, threshold: Number(e.target.value) / 100 }))}
              className={inputCls}
            />
          </Field>
        )}

        <button
          onClick={() => setRunKey((k) => k + 1)}
          className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800"
        >
          <Play size={14} /> Generate Report
        </button>
      </div>

      {/* Results */}
      {runKey === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center text-slate-400 text-sm">
          Set your filters and click <strong className="text-slate-700">Generate Report</strong>.
        </div>
      )}

      {reportQuery.isError && (
        <ErrorBox error={reportQuery.error} onRetry={() => reportQuery.refetch()} />
      )}

      {reportQuery.isLoading && (
        <div className="space-y-4">
          <SkeletonCard />
          <div className="bg-white rounded-lg shadow-sm p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={5} />)}
          </div>
        </div>
      )}

      {reportQuery.data && (
        <>
          {/* Export toolbar */}
          <div className="flex items-center justify-between mb-3">
            <SummaryBar summary={reportQuery.data.summary} period={reportQuery.data.period} />
            <div className="flex gap-1">
              <ExportButton icon={FileText} label="CSV" onClick={() => handleExport('csv')} />
              <ExportButton icon={FileSpreadsheet} label="Excel" onClick={() => handleExport('xlsx')} />
              <ExportButton icon={FileType2} label="PDF" onClick={() => handleExport('pdf')} />
            </div>
          </div>

          {/* Chart */}
          {reportQuery.data.chart && (
            <div className="bg-white rounded-lg shadow-sm p-5 mb-4">
              <ReportChart chart={reportQuery.data.chart} />
            </div>
          )}

          {/* Table */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <DataTable
              columns={reportQuery.data.columns}
              rows={reportQuery.data.rows}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ExportButton({ icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 text-xs hover:bg-slate-100"
    >
      <Icon size={12} /> {label}
    </button>
  );
}

function SummaryBar({ summary, period }) {
  if (!summary) return <div />;
  return (
    <div className="text-xs text-slate-500">
      {period?.from && period?.to && `${period.from} → ${period.to} · `}
      {period?.date && `${period.date} · `}
      {period?.year && `${period.year} · `}
      {Object.entries(summary)
        .filter(([k]) => k !== 'flagCounts' && k !== 'currency')
        .map(([k, v]) => (
          <span key={k} className="ml-2">
            <span className="text-slate-400">{k}:</span>{' '}
            <span className="font-medium text-slate-700">
              {typeof v === 'number' ? Math.round(v * 100) / 100 : String(v)}
            </span>
          </span>
        ))}
    </div>
  );
}

function DataTable({ columns, rows }) {
  if (!rows?.length) {
    return (
      <div className="p-10 text-center text-slate-400 text-sm">
        No rows match these filters.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.slice(0, 500).map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : 'text-left'} text-slate-700`}
                >
                  {formatValue(r[c.key], c.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 500 && (
        <div className="px-3 py-2 text-xs text-slate-400 border-t">
          Showing 500 of {rows.length} rows. Export for the full dataset.
        </div>
      )}
    </div>
  );
}

function formatValue(v, fmtType) {
  if (v == null || v === '') return '—';
  if (fmtType === 'time') {
    try { return format(new Date(v), 'HH:mm'); } catch { return ''; }
  }
  if (v instanceof Date || (typeof v === 'string' && /T\d{2}:\d{2}/.test(v))) {
    try { return format(new Date(v), 'yyyy-MM-dd HH:mm'); } catch { return String(v); }
  }
  return String(v);
}

const inputCls =
  'mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
