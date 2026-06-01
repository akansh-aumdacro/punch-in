import { useCallback, useEffect, useState } from 'react';

const DEFAULT_OPTS = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 5_000,
};

// Wraps navigator.geolocation with stable callback shape: returns the latest
// fix, a loading flag while waiting, a human-readable error, and a refresh()
// to re-poll on demand (e.g. before a clock-in submission).
export function useGeolocation(opts = {}) {
  const [coords, setCoords] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocation API unavailable in this browser');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(pos.coords.accuracy);
        setLoading(false);
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied'
            : err.code === err.POSITION_UNAVAILABLE
              ? 'Location unavailable'
              : err.code === err.TIMEOUT
                ? 'Location request timed out'
                : err.message;
        setError(msg);
        setLoading(false);
      },
      { ...DEFAULT_OPTS, ...opts }
    );
  }, [opts.enableHighAccuracy, opts.timeout, opts.maximumAge]); // eslint-disable-line

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { coords, accuracy, error, loading, refresh };
}

export default useGeolocation;
