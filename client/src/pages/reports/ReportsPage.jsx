import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { REPORT_TYPES } from './reportConfigs';
import ReportViewer from './ReportViewer.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function ReportsPage() {
  const { user } = useAuth();
  const isAdmin = ['superadmin', 'hr'].includes(user?.role);

  // Hide admin-only reports from supervisors.
  const visible = REPORT_TYPES.filter((r) => !r.adminOnly || isAdmin);
  const [selectedKey, setSelectedKey] = useState(visible[0]?.key);
  const selected = visible.find((r) => r.key === selectedKey);

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 p-4">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Reports
        </h2>
        <nav className="space-y-1">
          {visible.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSelectedKey(key)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm text-left ${
                selectedKey === key
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        {isAdmin && (
          <div className="mt-6 pt-4 border-t border-slate-100">
            <Link
              to="/reports/schedules"
              className="flex items-center gap-2 px-3 py-2 rounded text-sm text-slate-600 hover:bg-slate-100"
            >
              <Mail size={16} />
              Scheduled Reports
            </Link>
          </div>
        )}
      </aside>

      <div className="flex-1 p-6 bg-slate-50 overflow-x-auto">
        {selected && <ReportViewer report={selected} />}
      </div>
    </div>
  );
}
