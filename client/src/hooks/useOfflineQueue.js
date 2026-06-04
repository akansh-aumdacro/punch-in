import { useCallback, useEffect, useRef, useState } from 'react';
import { attendanceApi } from '../api/attendance';

// IndexedDB-backed queue for attendance punches that the client couldn't post
// immediately (offline, server unreachable, etc.). On reconnect, drained in
// FIFO order via /api/attendance/sync-offline.

const DB_NAME = 'truein-offline';
const DB_VERSION = 1;
const STORE = 'punches';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function dbGetAll() {
  return withStore('readonly', (store) => {
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
    });
  });
}

async function dbAdd(punch) {
  return withStore('readwrite', (store) => store.put(punch));
}

async function dbDelete(clientId) {
  return withStore('readwrite', (store) => store.delete(clientId));
}

export function useOfflineQueue() {
  const [queue, setQueue] = useState([]);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncing, setSyncing] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const items = await dbGetAll();
      setQueue(items.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
    } catch {
      // IDB unavailable (private mode, SSR) — leave queue empty.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addPunch = useCallback(
    async (punch) => {
      const entry = {
        clientId: punch.clientId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: punch.timestamp || new Date().toISOString(),
        ...punch,
      };
      await dbAdd(entry);
      await refresh();
      return entry;
    },
    [refresh]
  );

  const syncNow = useCallback(async () => {
    if (inFlight.current) return null;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
    const items = await dbGetAll();
    if (items.length === 0) return { processed: 0, succeeded: 0, failed: 0 };

    inFlight.current = true;
    setSyncing(true);
    try {
      const res = await attendanceApi.syncOffline(items);
      // Remove every result the server accepted; keep failures for retry, but
      // also drop client-error failures (e.g. duplicate, forbidden) so they
      // don't get retried forever.
      const removable = (res.results || []).filter(
        (r) =>
          r.ok ||
          [
            'DUPLICATE_CLOCK_IN', 'NO_OPEN_LOG', 'OFF_SITE', 'WORKER_INACTIVE', 'WORKER_NOT_FOUND',
            // Face-verification rejections are terminal — never retry blindly.
            'NO_MATCH', 'NO_FACE', 'MULTIPLE_FACES', 'LOW_QUALITY', 'NOT_ENROLLED',
            'FACE_IMAGE_REQUIRED', 'FACE_NOT_VERIFIED',
          ].includes(r.code)
      );
      await Promise.all(removable.map((r) => dbDelete(r.clientId)));
      await refresh();
      return res;
    } finally {
      inFlight.current = false;
      setSyncing(false);
    }
  }, [refresh]);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      syncNow().catch(() => {});
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncNow]);

  return { queue, isOnline, syncing, addPunch, syncNow, refresh };
}

export default useOfflineQueue;
