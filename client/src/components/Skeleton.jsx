export function SkeletonRow({ cols = 6 }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3.5 bg-slate-200 rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonCard() {
  return (
    <div className="animate-pulse bg-white rounded-lg shadow p-5">
      <div className="h-5 bg-slate-200 rounded w-1/3 mb-3" />
      <div className="h-3 bg-slate-200 rounded w-2/3 mb-2" />
      <div className="h-3 bg-slate-200 rounded w-1/2" />
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  const msg = error?.response?.data?.error || error?.message || 'Something went wrong';
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
      <div className="font-medium">Failed to load</div>
      <div className="mt-1 text-red-600">{msg}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 text-red-700 underline text-xs hover:no-underline"
        >
          Retry
        </button>
      )}
    </div>
  );
}
