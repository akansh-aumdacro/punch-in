import api from './axios';

export const aiApi = {
  feed: (params = {}) => api.get('/ai/anomalies', { params }).then((r) => r.data),
  summary: () => api.get('/ai/anomalies/summary').then((r) => r.data),
  resolve: (id, notes) => api.post(`/ai/anomalies/${id}/resolve`, { notes }).then((r) => r.data),
  dismiss: (id, notes) => api.post(`/ai/anomalies/${id}/dismiss`, { notes }).then((r) => r.data),
  runScan: () => api.post('/ai/run-scan').then((r) => r.data),
};

// Display labels and tone metadata for each anomaly type. Shared by the feed
// rows and the badge so type → color/icon is consistent.
export const ANOMALY_META = {
  PHOTO_PUNCH_LOW_MATCH:    { label: 'Photo Punch Low Match',   tone: 'rose' },
  BOUNDARY_HOVERING:        { label: 'Boundary Hovering',       tone: 'amber' },
  SYSTEMATIC_LATE_GAMING:   { label: 'Late Gaming',             tone: 'slate' },
  OVERTIME_MANIPULATION:    { label: 'OT Manipulation',         tone: 'amber' },
  BULK_SPOOF:               { label: 'Bulk Spoof',              tone: 'rose' },
  MISSING_PUNCH_OUT:        { label: 'Missing Punch-out',       tone: 'amber' },
  EXCESSIVE_CORRECTIONS:    { label: 'Excessive Corrections',   tone: 'slate' },
  GPS_SPOOF_HEADER:         { label: 'GPS Spoof',               tone: 'rose' },
};

export const SEVERITY_META = {
  high:   { label: 'HIGH',   bar: 'bg-rose-500',   chip: 'bg-rose-100 text-rose-700' },
  medium: { label: 'MEDIUM', bar: 'bg-amber-500',  chip: 'bg-amber-100 text-amber-700' },
  low:    { label: 'LOW',    bar: 'bg-slate-400',  chip: 'bg-slate-200 text-slate-700' },
};

export default aiApi;
