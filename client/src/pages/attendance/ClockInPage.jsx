import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Webcam from 'react-webcam';
import toast from 'react-hot-toast';
import { Camera, MapPin, Wifi, WifiOff, CheckCircle2, AlertCircle, ScanFace, LogOut as ClockOutIcon } from 'lucide-react';

import { attendanceApi } from '../../api/attendance';
import useGeolocation from '../../hooks/useGeolocation';
import useOfflineQueue from '../../hooks/useOfflineQueue';
import { useAuth } from '../../context/AuthContext.jsx';

const VIDEO_CONSTRAINTS = {
  width: 480,
  height: 360,
  facingMode: 'user',
};

export default function ClockInPage() {
  const { user } = useAuth();
  const webcamRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }

  const { coords, accuracy, error: geoError, loading: geoLoading, refresh } = useGeolocation();
  const { queue, isOnline, syncing, addPunch, syncNow } = useOfflineQueue();

  const submit = useCallback(
    async (type) => {
      setBusy(true);
      setResult(null);

      const faceImageBase64 =
        type === 'clock_in' && webcamRef.current ? webcamRef.current.getScreenshot() : null;

      // Surface the verification step to the user while the backend matches.
      if (type === 'clock_in') {
        setResult({ ok: null, message: 'Verifying your face…' });
      }

      const payload = {
        type,
        userId: user?.id,
        siteId: user?.site_id?._id || user?.site_id || null,
        lat: coords?.lat,
        lng: coords?.lng,
        method: 'face',
        faceImageBase64,
        timestamp: new Date().toISOString(),
        clientId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };

      // Offline path: queue and bail. Sync will replay later via useOfflineQueue.
      if (!isOnline) {
        await addPunch(payload);
        setResult({ ok: true, message: `${labelFor(type)} saved offline — will sync when back online` });
        toast.success('Saved offline');
        setBusy(false);
        return;
      }

      try {
        if (type === 'clock_in') {
          const res = await attendanceApi.clockIn(payload);
          const pct =
            typeof res?.faceMatchScore === 'number'
              ? ` (${Math.round(res.faceMatchScore * 100)}% match)`
              : '';
          setResult({ ok: true, message: `Face verified — clocked in successfully${pct}` });
        } else {
          await attendanceApi.clockOut(payload);
          setResult({ ok: true, message: 'Clocked out successfully' });
        }
        toast.success(labelFor(type) + ' confirmed');
      } catch (err) {
        const status = err?.response?.status;
        const code = err?.response?.data?.code;
        const msg = err?.response?.data?.error || err.message || 'Request failed';
        // Network-ish errors → queue for later. Logical 4xx → surface to user.
        // Face-verification failures are deliberate rejections — never queue them.
        const isVerificationFailure = status >= 400 && status < 500;
        if (!status || (status >= 500 && !isVerificationFailure)) {
          await addPunch(payload);
          setResult({ ok: false, message: `Server unreachable — queued for retry` });
          toast('Queued for retry', { icon: '📥' });
        } else {
          setResult({ ok: false, message: msg, code });
          toast.error(msg);
        }
      } finally {
        setBusy(false);
      }
    },
    [coords, isOnline, user, addPunch]
  );

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800">Clock In / Out</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Hi {user?.name?.split(' ')[0] || 'there'} — face the camera and tap to punch.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Pill icon={isOnline ? Wifi : WifiOff} tone={isOnline ? 'emerald' : 'amber'}>
            {isOnline ? 'Online' : 'Offline mode'}
          </Pill>
          <Pill icon={MapPin} tone={coords ? 'emerald' : 'rose'}>
            {geoLoading
              ? 'Locating…'
              : coords
                ? `GPS ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} (±${Math.round(accuracy || 0)}m)`
                : geoError || 'No GPS'}
          </Pill>
          {queue.length > 0 && (
            <Pill tone="amber">
              {queue.length} queued punch{queue.length === 1 ? '' : 'es'}
            </Pill>
          )}
        </div>

        <div className="mt-5 bg-black rounded-lg overflow-hidden aspect-[4/3]">
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored
            screenshotFormat="image/jpeg"
            screenshotQuality={0.85}
            videoConstraints={VIDEO_CONSTRAINTS}
            className="w-full h-full object-cover"
            onUserMediaError={(err) =>
              setResult({ ok: false, message: `Camera error: ${err?.message || err}` })
            }
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={() => submit('clock_in')}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
          >
            <Camera size={18} />
            {busy ? 'Submitting…' : 'Clock In'}
          </button>
          <button
            onClick={() => submit('clock_out')}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-900 disabled:opacity-60"
          >
            <ClockOutIcon size={18} />
            {busy ? 'Submitting…' : 'Clock Out'}
          </button>
        </div>

        {result && (
          <div
            className={`mt-4 rounded-lg p-4 flex items-start gap-3 animate-in fade-in ${
              result.ok === null
                ? 'bg-slate-50 text-slate-700 border border-slate-200'
                : result.ok
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {result.ok === null ? (
              <ScanFace size={20} className="animate-pulse" />
            ) : result.ok ? (
              <CheckCircle2 size={20} />
            ) : (
              <AlertCircle size={20} />
            )}
            <div className="text-sm">
              {result.message}
              {result.code === 'NOT_ENROLLED' && (
                <div className="mt-1">
                  <Link to="/face/enroll" className="font-medium underline">
                    Enroll your face now →
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {queue.length > 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center justify-between text-sm">
              <div className="font-medium text-amber-800">
                {queue.length} punch{queue.length === 1 ? '' : 'es'} waiting to sync
              </div>
              <button
                onClick={() => syncNow().then((r) => r && toast.success(`Synced ${r.succeeded}/${r.processed}`))}
                disabled={syncing || !isOnline}
                className="text-xs px-2 py-1 rounded border border-amber-300 hover:bg-amber-100 disabled:opacity-50"
              >
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
            <ul className="mt-2 text-xs text-amber-700 space-y-0.5">
              {queue.slice(0, 5).map((p) => (
                <li key={p.clientId}>
                  {labelFor(p.type)} at {new Date(p.timestamp).toLocaleTimeString()}
                </li>
              ))}
              {queue.length > 5 && <li>+{queue.length - 5} more…</li>}
            </ul>
          </div>
        )}

        <div className="mt-4 text-xs text-slate-400">
          <button
            onClick={refresh}
            className="underline hover:no-underline"
          >
            Refresh GPS
          </button>
        </div>
      </div>
    </div>
  );
}

function Pill({ icon: Icon, tone = 'slate', children }) {
  const tones = {
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${tones[tone]}`}>
      {Icon && <Icon size={12} />}
      {children}
    </span>
  );
}

function labelFor(type) {
  return type === 'clock_out' ? 'Clock out' : 'Clock in';
}
