import { Link } from 'react-router-dom';

export default function Card({ title, action, actionTo, actionLabel, children }) {
  return (
    <div className="bg-white rounded-lg shadow-sm">
      {(title || action || actionTo) && (
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actionTo && (
            <Link to={actionTo} className="text-xs text-slate-500 hover:text-slate-700">
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
