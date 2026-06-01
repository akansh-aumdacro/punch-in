import { useLocation, Link } from 'react-router-dom';
import { LogOut, Menu, ChevronRight } from 'lucide-react';
import NotificationBell from './NotificationBell.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const PATH_LABELS = {
  '': 'Dashboard',
  attendance: 'Attendance',
  workers: 'Workers',
  sites: 'Sites',
  agencies: 'Agencies',
  shifts: 'Shifts',
  timesheets: 'Timesheets',
  leaves: 'Leaves',
  reports: 'Reports',
  ai: 'AI Time Guard',
  feed: 'Feed',
  scheduler: 'Scheduler',
  templates: 'Templates',
  swaps: 'Swaps',
  'weekly-off': 'Weekly Off',
  'clock-in': 'Clock In',
  live: 'Live',
  logs: 'Logs',
  queue: 'Queue',
  approvals: 'Approvals',
  request: 'Request',
  balances: 'Balances',
  types: 'Types',
  history: 'History',
  schedules: 'Schedules',
  admin: 'Admin',
  hr: 'HR',
  supervisor: 'Supervisor',
  worker: 'Worker',
  agency: 'Agency',
  dashboard: 'Dashboard',
  new: 'New',
};

function prettyCrumb(segment) {
  if (PATH_LABELS[segment]) return PATH_LABELS[segment];
  // ObjectId-like segments → ":id"
  if (/^[0-9a-f]{24}$/i.test(segment)) return 'Detail';
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
}

export default function Topbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  return (
    <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-3 shrink-0">
      <button
        onClick={onToggleSidebar}
        className="md:hidden p-1.5 rounded hover:bg-slate-100"
        title="Toggle sidebar"
      >
        <Menu size={18} />
      </button>

      {/* Breadcrumbs */}
      <nav className="flex items-center text-sm min-w-0">
        <Link to="/" className="text-slate-500 hover:text-slate-800">Home</Link>
        {segments.map((seg, i) => {
          const path = '/' + segments.slice(0, i + 1).join('/');
          const isLast = i === segments.length - 1;
          return (
            <span key={path} className="flex items-center min-w-0">
              <ChevronRight size={14} className="text-slate-300 mx-1 shrink-0" />
              {isLast ? (
                <span className="text-slate-800 font-medium truncate">{prettyCrumb(seg)}</span>
              ) : (
                <Link to={path} className="text-slate-500 hover:text-slate-800 truncate">
                  {prettyCrumb(seg)}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <NotificationBell />
        <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-200">
          <div className="text-right leading-tight">
            <div className="text-sm font-medium text-slate-800 truncate max-w-[160px]">{user?.name}</div>
            <div className="text-[11px] text-slate-500 capitalize">{user?.role}</div>
          </div>
          <button
            onClick={logout}
            className="p-2 rounded hover:bg-slate-100 text-slate-500"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
