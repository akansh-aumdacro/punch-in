import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Webcam from 'react-webcam';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { Camera, CheckCircle2, AlertCircle, ShieldCheck, RefreshCw } from 'lucide-react';

import { faceApi } from '../../api/face';
import { useAuth } from '../../context/AuthContext.jsx';

const VIDEO_CONSTRAINTS = { width: 480, height: 360, facingMode: 'user' };

// Face Enrollment — capture the employee's face during registration and store
// the embedding on the backend. Self-enroll by default; HR/superadmin can
// enroll on behalf of a worker via ?userId=<id>.
export default function FaceEnrollmentPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const targetUserId = params.get('userId') || null;
  const isSelf = !targetUserId || String(targetUserId) === String(user?.id);

  const webcamRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, message }

  const statusQuery = useQuery({
    queryKey: ['face-status', targetUserId || 'self'],
    queryFn: () => faceApi.status(targetUserId),
  });

  useEffect(() => {
    if (statusQuery.data && statusQuery.data.engineReady === false) {
      setResult({
        ok: false,
        message:
          'Face recognition engine is not configured on the server. Enrollment is unavailable until models are installed.',
      });
    }
  }, [statusQuery.data]);

  const enroll = useCallback(async () => {
    setBusy(true);
    setResult(null);
    try {
      const imageBase64 = webcamRef.current?.getScreenshot();
      if (!imageBase64) {
        setResult({ ok: false, message: 'Could not capture image from camera.' });
        setBusy(false);
        return;
      }
      const res = await faceApi.enroll(imageBase64, isSelf ? undefined : targetUserId);
      setResult({
        ok: true,
        message: `Face enrolled successfully (capture quality ${(res.enrollmentScore * 100).toFixed(0)}%).`,
      });
      toast.success('Face enrolled');
      statusQuery.refetch();
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Enrollment failed';
      setResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [isSelf, targetUserId, statusQuery]);

  const status = statusQuery.data;

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ShieldCheck size={22} /> Face Enrollment
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {isSelf
            ? 'Register your face so you can punch in with face verification.'
            : 'Registering face for the selected employee.'}
        </p>

        {status?.enrolled && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 size={18} />
            <div>
              Already enrolled
              {status.enrolledAt
                ? ` on ${new Date(status.enrolledAt).toLocaleDateString()}`
                : ''}
              . Capturing again will replace the stored face.
            </div>
          </div>
        )}

        <div className="mt-5 bg-black rounded-lg overflow-hidden aspect-[4/3]">
          <Webcam
            ref={webcamRef}
            audio={false}
            mirrored
            screenshotFormat="image/jpeg"
            screenshotQuality={0.9}
            videoConstraints={VIDEO_CONSTRAINTS}
            className="w-full h-full object-cover"
            onUserMediaError={(err) =>
              setResult({ ok: false, message: `Camera error: ${err?.message || err}` })
            }
          />
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Tips: face the camera straight on in good lighting, with only one
          person in frame and nothing covering your face.
        </p>

        <div className="mt-4 flex gap-3">
          <button
            onClick={enroll}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? <RefreshCw size={18} className="animate-spin" /> : <Camera size={18} />}
            {busy ? 'Enrolling…' : status?.enrolled ? 'Re-capture face' : 'Capture & enroll'}
          </button>
        </div>

        {result && (
          <div
            className={`mt-4 rounded-lg p-4 flex items-start gap-3 ${
              result.ok
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {result.ok ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <div className="text-sm">{result.message}</div>
          </div>
        )}
      </div>
    </div>
  );
}
