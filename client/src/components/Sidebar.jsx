import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, MapPin, Building2, Activity,
  ClipboardList, Camera, LogOut, Clock, CalendarDays, ArrowRightLeft, CalendarOff,
  FileSpreadsheet, Inbox, Palmtree, CalendarCheck2, Wallet, BarChart3, ShieldAlert,
  Settings, Plug, KeyRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import AnomalyBadge from './AnomalyBadge.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, allow: 'all' },
  { to: '/attendance/clock-in', label: 'Clock In', icon: Camera, allow: ['worker', 'supervisor', 'hr', 'superadmin'] },
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
  { to: '/settings/org', label: 'Organization', icon: Settings, allow: ['hr', 'superadmin'] },
  { to: '/settings/policies', label: 'Policies', icon: Settings, allow: ['hr', 'superadmin'] },
  { to: '/settings/integrations', label: 'Integrations', icon: Plug, allow: ['hr', 'superadmin'] },
  { to: '/settings/api-keys', label: 'API Keys', icon: KeyRound, allow: ['superadmin'] },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  const visibleNav = NAV.filter(
    (item) => item.allow === 'all' || (user && item.allow.includes(user.role))
  );

  return (
    <aside className="w-60 shrink-0 bg-slate-900 text-slate-100 min-h-screen flex flex-col">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="text-xl font-bold">Truein</div>
        <div className="text-xs text-slate-400 mt-0.5">Time & Attendance</div>
        {user && ['supervisor', 'hr', 'superadmin'].includes(user.role) && (
          <div className="mt-3">
            <AnomalyBadge />
          </div>
        )}
      </div>

      <nav className="flex-1 py-4">
        {visibleNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-5 py-2.5 text-sm transition ${
                isActive
                  ? 'bg-slate-800 text-white border-l-2 border-blue-400'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-slate-800 text-xs">
        <div className="text-slate-300 font-medium truncate">{user?.name}</div>
        <div className="text-slate-500 truncate">{user?.email}</div>
        <div className="text-slate-500 mt-0.5 capitalize">{user?.role}</div>
        <button
          onClick={logout}
          className="mt-3 flex items-center gap-2 text-slate-400 hover:text-white"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </aside>
  );
}
