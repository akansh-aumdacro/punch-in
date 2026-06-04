const cron = require('node-cron');
const aiTimeGuard = require('./aiTimeGuard');

let started = false;
let lastScan = null;

async function runNightlyScan() {
  console.log('[punchin] AI Time Guard nightly scan starting…');
  try {
    const results = await aiTimeGuard.detectAnomaliesAllOrgs();
    lastScan = { ranAt: new Date(), results };
    const totalUpserted = results.reduce((s, r) => s + (r.upserted || 0), 0);
    console.log(`[punchin] AI Time Guard scan complete: ${results.length} org(s), ${totalUpserted} anomalies upserted`);
  } catch (err) {
    console.error('[punchin] AI Time Guard nightly scan failed:', err.message);
  }
}

function start() {
  if (started) return;
  started = true;
  // Daily at 02:00 server time. Use a relatively wide spread vs. other crons
  // (report scheduler runs hourly on the hour) so they don't pile on Mongo.
  cron.schedule('0 2 * * *', () => {
    runNightlyScan().catch((err) => console.error('[punchin] AI scheduler tick failed:', err.message));
  });
  console.log('[punchin] AI Time Guard scheduler started (daily 02:00)');
}

function getLastScan() {
  return lastScan;
}

function recordManualScan(summary) {
  lastScan = { ranAt: new Date(), results: Array.isArray(summary) ? summary : [summary] };
}

module.exports = { start, runNightlyScan, getLastScan, recordManualScan };
