export function SkeletonRow({ cols = 6 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="shimmer h-3.5 w-3/4 rounded bg-slate-200" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-5 shadow-sm">
      <div className="shimmer mb-3 h-5 w-1/3 rounded bg-slate-200" />
      <div className="shimmer mb-2 h-3 w-2/3 rounded bg-slate-200" />
      <div className="shimmer h-3 w-1/2 rounded bg-slate-200" />
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  const msg = error?.response?.data?.error || error?.message || 'Something went wrong';
  return (
    <div className="animate-fade-up rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
      <div className="font-semibold">Failed to load</div>
      <div className="mt-1 text-rose-600">{msg}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 text-xs font-medium text-rose-700 underline transition hover:no-underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
