import { useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
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
  face: 'Face',
  enroll: 'Enrollment',
  settings: 'Settings',
  roles: 'Roles & Permissions',
  org: 'Organization',
  policies: 'Policies',
  integrations: 'Integrations',
  'api-keys': 'API Keys',
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
  if (/^[0-9a-f]{24}$/i.test(segment)) return 'Detail';
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
}

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || 'U';
}

export default function Topbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  return (
    <header className="sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 py-2.5 backdrop-blur-md">
      <button
        onClick={onToggleSidebar}
        className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100 md:hidden"
        title="Toggle sidebar"
      >
        <Menu size={18} />
      </button>

      {/* Breadcrumbs */}
      <nav className="flex min-w-0 items-center text-sm">
        <Link to="/" className="text-slate-500 transition hover:text-slate-900">Home</Link>
        {segments.map((seg, i) => {
          const path = '/' + segments.slice(0, i + 1).join('/');
          const isLast = i === segments.length - 1;
          return (
            <span key={path} className="flex min-w-0 items-center">
              <ChevronRight size={14} className="mx-1 shrink-0 text-slate-300" />
              {isLast ? (
                <motion.span
                  key={path}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="truncate font-semibold text-slate-900"
                >
                  {prettyCrumb(seg)}
                </motion.span>
              ) : (
                <Link to={path} className="truncate text-slate-500 transition hover:text-slate-900">
                  {prettyCrumb(seg)}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <NotificationBell />
        <div className="hidden items-center gap-2.5 border-l border-slate-200 pl-3 sm:flex">
          <div className="text-right leading-tight">
            <div className="max-w-[160px] truncate text-sm font-semibold text-slate-800">{user?.name}</div>
            <div className="text-[11px] capitalize text-slate-500">{user?.role}</div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 text-xs font-bold text-white shadow-sm">
            {initials(user?.name)}
          </div>
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={logout}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
            title="Logout"
          >
            <LogOut size={16} />
          </motion.button>
        </div>
      </div>
    </header>
  );
}
