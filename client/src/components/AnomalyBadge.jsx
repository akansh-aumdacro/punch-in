import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { aiApi } from '../api/ai';

// Compact badge: shows count of open HIGH anomalies with a pulsing dot.
// Designed to live in the sidebar header or a dashboard header strip.
export default function AnomalyBadge({ to = '/ai/feed', compact = false }) {
  const summary = useQuery({
    queryKey: ['ai', 'summary'],
    queryFn: () => aiApi.summary(),
    refetchInterval: 60_000,
    retry: false,
  });

  const count = summary.data?.openHighCount || 0;
  const total =
    (summary.data?.severity?.high || 0) +
    (summary.data?.severity?.medium || 0) +
    (summary.data?.severity?.low || 0);

  if (compact) {
    return (
      <Link
        to={to}
        title={`${count} open HIGH anomalies (${total} total open)`}
        className="relative inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white"
      >
        <ShieldAlert size={14} />
        {count > 0 ? (
          <span className="bg-rose-500 text-white px-1.5 py-0.5 rounded-full text-[10px] font-medium">
            {count}
          </span>
        ) : (
          <span className="text-slate-400">OK</span>
        )}
      </Link>
    );
  }

  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-md bg-slate-800/40 hover:bg-slate-800 px-3 py-2 transition"
      title={`${count} open HIGH anomalies`}
    >
      <div className="relative">
        <ShieldAlert size={18} className={count > 0 ? 'text-rose-400' : 'text-slate-400'} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
          </span>
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-xs text-slate-400 leading-none">AI Time Guard</span>
        <span className="text-sm font-semibold text-white leading-tight">
          {count > 0 ? `${count} HIGH` : 'All clear'}
        </span>
      </div>
    </Link>
  );
}
