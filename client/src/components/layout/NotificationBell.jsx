import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { notificationsApi } from '../../api/notifications';
import { getAttendanceSocket } from '../../api/socket';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const ref = useRef(null);

  const listQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list({ limit: 20 }),
    refetchInterval: 60_000,
  });

  // Live refresh when the server emits `notification:new` to this user's room.
  useEffect(() => {
    const sock = getAttendanceSocket();
    if (!sock) return undefined;
    const onNew = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
    sock.on('notification:new', onNew);
    return () => sock.off('notification:new', onNew);
  }, [queryClient]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const markRead = useMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const remove = useMutation({
    mutationFn: (id) => notificationsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = listQuery.data?.unread || 0;
  const items = listQuery.data?.items || [];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded hover:bg-slate-100"
        title={`${unread} unread`}
      >
        <Bell size={18} className="text-slate-600" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-rose-500 text-white text-[10px] font-medium min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-50 max-h-[480px] flex flex-col">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="font-semibold text-slate-800 text-sm">Notifications</span>
            {unread > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="text-xs text-slate-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {listQuery.isLoading && (
              <div className="p-4 text-sm text-slate-400">Loading…</div>
            )}
            {!listQuery.isLoading && items.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-400">
                No notifications yet.
              </div>
            )}
            {items.map((n) => (
              <div
                key={n._id}
                className={`px-4 py-3 border-b border-slate-100 hover:bg-slate-50 ${
                  n.isRead ? '' : 'bg-blue-50/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {n.link ? (
                      <Link
                        to={n.link}
                        onClick={() => {
                          if (!n.isRead) markRead.mutate(n._id);
                          setOpen(false);
                        }}
                        className="block"
                      >
                        <div className="text-sm font-medium text-slate-800">{n.title}</div>
                        {n.message && (
                          <div className="text-xs text-slate-600 mt-0.5 line-clamp-2">{n.message}</div>
                        )}
                      </Link>
                    ) : (
                      <>
                        <div className="text-sm font-medium text-slate-800">{n.title}</div>
                        {n.message && (
                          <div className="text-xs text-slate-600 mt-0.5">{n.message}</div>
                        )}
                      </>
                    )}
                    <div className="text-[11px] text-slate-400 mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    {!n.isRead && (
                      <button
                        onClick={() => markRead.mutate(n._id)}
                        className="p-1 text-slate-400 hover:text-emerald-600"
                        title="Mark read"
                      >
                        <Check size={12} />
                      </button>
                    )}
                    <button
                      onClick={() => remove.mutate(n._id)}
                      className="p-1 text-slate-400 hover:text-rose-600"
                      title="Dismiss"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
