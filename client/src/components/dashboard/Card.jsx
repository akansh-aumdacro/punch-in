import { Link } from 'react-router-dom';

export default function Card({ title, action, actionTo, actionLabel, children }) {
  return (
    <div className="animate-fade-up rounded-xl border border-slate-200/70 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md">
      {(title || action || actionTo) && (
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actionTo && (
            <Link to={actionTo} className="text-xs font-medium text-indigo-600 transition hover:text-indigo-700">
              {actionLabel || 'View all →'}
            </Link>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
