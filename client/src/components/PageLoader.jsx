// Lightweight fallback shown while a lazily-loaded route chunk is fetched.
export default function PageLoader({ full = false }) {
  return (
    <div className={`flex items-center justify-center ${full ? 'min-h-screen' : 'min-h-[60vh]'}`}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
    </div>
  );
}
