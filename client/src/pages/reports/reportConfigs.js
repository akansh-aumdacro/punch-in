import {
  CalendarDays, CalendarRange, Wallet, Clock, UserMinus,
  TrendingUp, Palmtree, AlertTriangle, Building2, MapPin,
} from 'lucide-react';

const todayIso = () => new Date().toISOString().slice(0, 10);
const aWeekAgo = () => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
const aMonthAgo = () => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

// Per-report shape:
// {
//   key, label, icon, chartHint, defaultFilters,
//   filterFields: which filters to show ('date' | 'range' | 'site' | 'worker' | 'year' | 'threshold'),
//   requiresRange: boolean (used by ReportViewer to gate the fetch),
// }
export const REPORT_TYPES = [
  {
    key: 'daily-attendance',
    label: 'Daily Attendance',
    icon: CalendarDays,
    chartHint: 'Stacked bar — present / absent / late / leave / holiday',
    filterFields: ['date', 'site'],
    defaultFilters: { date: todayIso() },
  },
  {
    key: 'monthly-summary',
    label: 'Monthly Summary',
    icon: CalendarRange,
    chartHint: 'Line — daily attendance %',
    filterFields: ['range', 'site'],
    defaultFilters: { startDate: aMonthAgo(), endDate: todayIso() },
  },
  {
    key: 'payroll-calculation',
    label: 'Payroll Calculation',
    icon: Wallet,
    chartHint: 'Table only',
    filterFields: ['range', 'site'],
    defaultFilters: { startDate: aMonthAgo(), endDate: todayIso() },
    adminOnly: true,
  },
  {
    key: 'late-arrivals',
    label: 'Late Arrivals',
    icon: Clock,
    chartHint: 'Bar — top 10 by total late minutes',
    filterFields: ['range', 'site'],
    defaultFilters: { startDate: aMonthAgo(), endDate: todayIso() },
  },
  {
    key: 'absenteeism',
    label: 'Absenteeism',
    icon: UserMinus,
    chartHint: 'Horizontal bar — workers above threshold',
    filterFields: ['range', 'site', 'threshold'],
    defaultFilters: { startDate: aMonthAgo(), endDate: todayIso(), threshold: 0.1 },
  },
  {
    key: 'overtime',
    label: 'Overtime',
    icon: TrendingUp,
    chartHint: 'Bar — OT hours, top 10',
    filterFields: ['range', 'site'],
    defaultFilters: { startDate: aMonthAgo(), endDate: todayIso() },
  },
  {
    key: 'leave-utilization',
    label: 'Leave Utilization',
    icon: Palmtree,
    chartHint: 'Doughnut — leave days by type',
    filterFields: ['year'],
    defaultFilters: { year: new Date().getFullYear() },
  },
  {
    key: 'exception',
    label: 'Exception',
    icon: AlertTriangle,
    chartHint: 'Bar — anomaly flag frequencies',
    filterFields: ['range', 'site'],
    defaultFilters: { startDate: aWeekAgo(), endDate: todayIso() },
  },
  {
    key: 'contractor-timesheet',
    label: 'Contractor Timesheet',
    icon: Building2,
    chartHint: 'Bar — total hours per agency',
    filterFields: ['range'],
    defaultFilters: { startDate: aMonthAgo(), endDate: todayIso() },
    adminOnly: true,
  },
  {
    key: 'site-summary',
    label: 'Site Summary',
    icon: MapPin,
    chartHint: 'Grouped bar — sites side by side over time',
    filterFields: ['range'],
    defaultFilters: { startDate: aWeekAgo(), endDate: todayIso() },
  },
];

export function findReport(key) {
  return REPORT_TYPES.find((r) => r.key === key);
}

// Stable color palette for stacked / grouped charts.
export const CHART_PALETTE = [
  '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
];

export const STATUS_COLORS = {
  present: '#10b981',
  absent: '#ef4444',
  late: '#f59e0b',
  leave: '#8b5cf6',
  holiday: '#94a3b8',
  half_day: '#06b6d4',
};
