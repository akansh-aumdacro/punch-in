import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Users, MapPin, Building2, Activity,
  ClipboardList, Camera, ScanFace, LogOut, Clock, CalendarDays, ArrowRightLeft, CalendarOff,
  FileSpreadsheet, Inbox, Palmtree, CalendarCheck2, Wallet, BarChart3, ShieldAlert,
  Settings, Plug, KeyRound, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import AnomalyBadge from './AnomalyBadge.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, allow: 'all' },
  { to: '/attendance/clock-in', label: 'Clock In', icon: Camera, allow: ['worker', 'supervisor', 'hr', 'superadmin'] },
  { to: '/face/enroll', label: 'Face Enrollment', icon: ScanFace, allow: ['worker', 'supervisor', 'hr', 'superadmin'] },
  { to: '/attendance/live', label: 'Live Attendance', icon: Activity, allow: ['supervisor', 'hr', 'superadmin'] },
  { to: '/attendance/logs', label: 'Attendance Logs', icon: ClipboardList, allow: ['supervisor', 'hr', 'superadmin'] },
  { to: '/workers', label: 'Workers', icon: Users, allow: ['supervisor', 'hr', 'superadmin', 'agency_admin'] },
  { to: '/sites', label: 'Sites', icon: MapPin, allow: ['supervisor', 'hr', 'superadmin'] },
  { to: '/agencies', label: 'Agencies', icon: Building2, allow: ['hr', 'superadmin'] },
  { to: '/shifts/templates', label: 'Shift Templates', icon: Clock, allow: ['supervisor', 'hr', 'superadmin'] },
  { to: '/shifts/scheduler', label: 'Scheduler', icon: CalendarDays, allow: ['supervisor', 'hr', 'superadmin'] },
  { to: '/shifts/swaps', label: 'Shift Swaps', icon: ArrowRightLeft, allow: ['worker', 'supervisor', 'hr', 'superadmin'] },
  { to: '/shifts/weekly-off', label: 'Weekly Off', icon: CalendarOff, allow: ['hr', 'superadmin'] },
  { to: '/timesheets', label: 'Timesheets', icon: FileSpreadsheet, allow: ['worker', 'supervisor', 'hr', 'superadmin', 'agency_admin'] },
  { to: '/timesheets/queue', label: 'Approval Queue', icon: Inbox, allow: ['supervisor', 'hr', 'superadmin'] },
  { to: '/leaves/types', label: 'Leave Types', icon: Palmtree, allow: ['hr', 'superadmin'] },
  { to: '/leaves/balances', label: 'Leave Balances', icon: Wallet, allow: ['worker', 'supervisor', 'hr', 'superadmin', 'agency_admin'] },
  { to: '/leaves/request', label: 'Request Leave', icon: CalendarCheck2, allow: ['worker', 'supervisor', 'hr', 'superadmin', 'agency_admin'] },
  { to: '/leaves/history', label: 'My Leaves', icon: CalendarDays, allow: ['worker', 'supervisor', 'hr', 'superadmin', 'agency_admin'] },
  { to: '/leaves/approvals', label: 'Leave Approvals', icon: Inbox, allow: ['supervisor', 'hr', 'superadmin'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, allow: ['supervisor', 'hr', 'superadmin'] },
  { to: '/ai/feed', label: 'AI Time Guard', icon: ShieldAlert, allow: ['supervisor', 'hr', 'superadmin'] },
  { to: '/settings/roles', label: 'Roles & Permissions', icon: ShieldCheck, allow: ['hr', 'superadmin'], section: 'Settings' },
  { to: '/settings/org', label: 'Organization', icon: Settings, allow: ['hr', 'superadmin'], section: 'Settings' },
  { to: '/settings/policies', label: 'Policies', icon: Settings, allow: ['hr', 'superadmin'], section: 'Settings' },
  { to: '/settings/integrations', label: 'Integrations', icon: Plug, allow: ['hr', 'superadmin'], section: 'Settings' },
  { to: '/settings/api-keys', label: 'API Keys', icon: KeyRound, allow: ['superadmin'], section: 'Settings' },
];

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.025 } },
};
const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { duration: 0.25 } },
};

export default function Sidebar() {
  const { user, logout } = useAuth();

  const visibleNav = NAV.filter(
    (item) => item.allow === 'all' || (user && item.allow.includes(user.role))
  );

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-slate-900 text-slate-100">
      <div className="shrink-0 border-b border-slate-800/80 px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 shadow-lg shadow-indigo-900/40">
            <ScanFace size={18} className="text-white" />
          </div>
          <div>
            <div className="text-lg font-bold leading-none tracking-tight">PunchIn</div>
            <div className="mt-1 text-[11px] text-slate-400">Time &amp; Attendance</div>
          </div>
        </div>
        {user && ['supervisor', 'hr', 'superadmin'].includes(user.role) && (
          <div className="mt-3">
            <AnomalyBadge />
          </div>
        )}
      </div>

      <motion.nav
        variants={listVariants}
        initial="hidden"
        animate="show"
        className="min-h-0 flex-1 overflow-y-auto py-4"
      >
        {visibleNav.map(({ to, label, icon: Icon, section }, i) => {
          // Render a section heading the first time a new section appears.
          const showHeader = section && visibleNav[i - 1]?.section !== section;
          return (
            <motion.div key={to} variants={itemVariants}>
              {showHeader && (
                <div className="px-5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {section}
                </div>
              )}
              <NavLink to={to} end={to === '/'} className="group relative block">
                {({ isActive }) => (
                  <div
                    className={`mx-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150 ${
                      isActive
                        ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/10 text-white'
                        : 'text-slate-300 hover:translate-x-0.5 hover:bg-slate-800/70 hover:text-white'
                    }`}
                  >
                    {/* Animated active indicator that slides between items. */}
                    {isActive && (
                      <motion.span
                        layoutId="sidebar-active"
                        className="absolute inset-y-1 left-0 w-1 rounded-r-full bg-gradient-to-b from-indigo-400 to-violet-400"
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}
                    <Icon size={18} className={isActive ? 'text-indigo-300' : ''} />
                    <span>{label}</span>
                  </div>
                )}
              </NavLink>
            </motion.div>
          );
        })}
      </motion.nav>

      <div className="shrink-0 border-t border-slate-800/80 px-5 py-4 text-xs">
        <div className="truncate font-medium text-slate-300">{user?.name}</div>
        <div className="truncate text-slate-500">{user?.email}</div>
        <div className="mt-0.5 capitalize text-slate-500">{user?.role}</div>
        <button
          onClick={logout}
          className="mt-3 flex items-center gap-2 text-slate-400 transition hover:text-white"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </aside>
  );
}
