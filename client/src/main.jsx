import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { MotionConfig } from 'framer-motion';

import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { AttendanceProvider } from './context/AttendanceContext.jsx';
// Routing primitives + the app shell stay eager — they're tiny and needed on
// every navigation. Everything below is code-split via React.lazy.
import ProtectedRoute from './pages/auth/ProtectedRoute.jsx';
import RoleRoute from './pages/auth/RoleRoute.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import PageLoader from './components/PageLoader.jsx';
import { dashboardPathForRole } from './utils/roleRedirect';
import './index.css';

// Lazily-loaded route pages — each becomes its own chunk, fetched on demand.
const LoginPage = lazy(() => import('./pages/auth/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage.jsx'));
const SuperAdminDashboard = lazy(() => import('./pages/dashboard/SuperAdminDashboard.jsx'));
const HRDashboard = lazy(() => import('./pages/dashboard/HRDashboard.jsx'));
const SupervisorDashboard = lazy(() => import('./pages/dashboard/SupervisorDashboard.jsx'));
const WorkerDashboard = lazy(() => import('./pages/dashboard/WorkerDashboard.jsx'));
const AgencyDashboard = lazy(() => import('./pages/dashboard/AgencyDashboard.jsx'));
const WorkerListPage = lazy(() => import('./pages/workers/WorkerListPage.jsx'));
const WorkerFormPage = lazy(() => import('./pages/workers/WorkerFormPage.jsx'));
const SiteListPage = lazy(() => import('./pages/sites/SiteListPage.jsx'));
const AgencyListPage = lazy(() => import('./pages/agencies/AgencyListPage.jsx'));
const SiteFormPage = lazy(() => import('./pages/sites/SiteFormPage.jsx'));
const LiveDashboardPage = lazy(() => import('./pages/attendance/LiveDashboardPage.jsx'));
const AttendanceLogsPage = lazy(() => import('./pages/attendance/AttendanceLogsPage.jsx'));
const ClockInPage = lazy(() => import('./pages/attendance/ClockInPage.jsx'));
const FaceEnrollmentPage = lazy(() => import('./pages/face/FaceEnrollmentPage.jsx'));
const ShiftTemplatesPage = lazy(() => import('./pages/shifts/ShiftTemplatesPage.jsx'));
const ShiftSchedulerPage = lazy(() => import('./pages/shifts/ShiftSchedulerPage.jsx'));
const ShiftSwapPage = lazy(() => import('./pages/shifts/ShiftSwapPage.jsx'));
const WeeklyOffPage = lazy(() => import('./pages/shifts/WeeklyOffPage.jsx'));
const TimesheetListPage = lazy(() => import('./pages/timesheets/TimesheetListPage.jsx'));
const TimesheetDetailPage = lazy(() => import('./pages/timesheets/TimesheetDetailPage.jsx'));
const TimesheetApprovalQueue = lazy(() => import('./pages/timesheets/TimesheetApprovalQueue.jsx'));
const LeaveTypesPage = lazy(() => import('./pages/leaves/LeaveTypesPage.jsx'));
const LeaveBalancePage = lazy(() => import('./pages/leaves/LeaveBalancePage.jsx'));
const LeaveRequestPage = lazy(() => import('./pages/leaves/LeaveRequestPage.jsx'));
const LeaveApprovalPage = lazy(() => import('./pages/leaves/LeaveApprovalPage.jsx'));
const LeaveHistoryPage = lazy(() => import('./pages/leaves/LeaveHistoryPage.jsx'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage.jsx'));
const ScheduledReportsPage = lazy(() => import('./pages/reports/ScheduledReportsPage.jsx'));
const AnomalyFeedPage = lazy(() => import('./pages/ai/AnomalyFeedPage.jsx'));
const OrganizationSettings = lazy(() => import('./pages/settings/OrganizationSettings.jsx'));
const PolicySettings = lazy(() => import('./pages/settings/PolicySettings.jsx'));
const IntegrationsPage = lazy(() => import('./pages/settings/IntegrationsPage.jsx'));
const APIKeysPage = lazy(() => import('./pages/settings/APIKeysPage.jsx'));
const RolesPermissionsPage = lazy(() => import('./pages/settings/RolesPermissionsPage.jsx'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Serve cached data instantly on revisit/navigation; refetch in the
      // background after 30s instead of on every mount.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
});

function HomeRedirect() {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={dashboardPathForRole(user?.role)} replace />;
}

function DashboardPlaceholder({ title }) {
  const { user } = useAuth();
  return (
    <div className="p-6">
      <div className="max-w-3xl bg-white shadow-sm rounded-lg p-6">
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <p className="text-slate-500 mt-1">
          Signed in as <span className="font-medium">{user?.email}</span> ({user?.role})
        </p>
      </div>
    </div>
  );
}

function Unauthorized() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-800">403</h1>
        <p className="mt-2 text-slate-500">You don't have access to this page.</p>
        <Link to="/" className="mt-4 inline-block text-slate-900 underline">
          Go home
        </Link>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
      <AuthProvider>
        <AttendanceProvider>
          <BrowserRouter>
            <Suspense fallback={<PageLoader full />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/unauthorized" element={<Unauthorized />} />

              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/" element={<HomeRedirect />} />

                  <Route
                    path="/admin/dashboard"
                    element={
                      <RoleRoute allow={['superadmin']}>
                        <SuperAdminDashboard />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/hr/dashboard"
                    element={
                      <RoleRoute allow={['hr', 'superadmin']}>
                        <HRDashboard />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/supervisor/dashboard"
                    element={
                      <RoleRoute allow={['supervisor', 'hr', 'superadmin']}>
                        <SupervisorDashboard />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/agency/dashboard"
                    element={
                      <RoleRoute allow={['agency_admin', 'hr', 'superadmin']}>
                        <AgencyDashboard />
                      </RoleRoute>
                    }
                  />
                  <Route path="/worker/dashboard" element={<WorkerDashboard />} />

                  <Route path="/workers" element={<WorkerListPage />} />
                  <Route
                    path="/workers/new"
                    element={
                      <RoleRoute allow={['superadmin', 'hr']}>
                        <WorkerFormPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/workers/:id"
                    element={
                      <RoleRoute allow={['superadmin', 'hr']}>
                        <WorkerFormPage />
                      </RoleRoute>
                    }
                  />

                  <Route path="/sites" element={<SiteListPage />} />
                  <Route
                    path="/sites/new"
                    element={
                      <RoleRoute allow={['superadmin', 'hr']}>
                        <SiteFormPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/sites/:id"
                    element={
                      <RoleRoute allow={['superadmin', 'hr']}>
                        <SiteFormPage />
                      </RoleRoute>
                    }
                  />

                  <Route
                    path="/agencies"
                    element={
                      <RoleRoute allow={['superadmin', 'hr', 'supervisor', 'agency_admin']}>
                        <AgencyListPage />
                      </RoleRoute>
                    }
                  />

                  <Route path="/attendance/clock-in" element={<ClockInPage />} />
                  <Route path="/face/enroll" element={<FaceEnrollmentPage />} />
                  <Route
                    path="/attendance/live"
                    element={
                      <RoleRoute allow={['superadmin', 'hr', 'supervisor']}>
                        <LiveDashboardPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/attendance/logs"
                    element={
                      <RoleRoute allow={['superadmin', 'hr', 'supervisor']}>
                        <AttendanceLogsPage />
                      </RoleRoute>
                    }
                  />

                  <Route
                    path="/shifts/templates"
                    element={
                      <RoleRoute allow={['superadmin', 'hr', 'supervisor']}>
                        <ShiftTemplatesPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/shifts/scheduler"
                    element={
                      <RoleRoute allow={['superadmin', 'hr', 'supervisor']}>
                        <ShiftSchedulerPage />
                      </RoleRoute>
                    }
                  />
                  <Route path="/shifts/swaps" element={<ShiftSwapPage />} />
                  <Route
                    path="/shifts/weekly-off"
                    element={
                      <RoleRoute allow={['superadmin', 'hr']}>
                        <WeeklyOffPage />
                      </RoleRoute>
                    }
                  />

                  <Route path="/timesheets" element={<TimesheetListPage />} />
                  <Route path="/timesheets/:id" element={<TimesheetDetailPage />} />
                  <Route
                    path="/timesheets/queue"
                    element={
                      <RoleRoute allow={['superadmin', 'hr', 'supervisor']}>
                        <TimesheetApprovalQueue />
                      </RoleRoute>
                    }
                  />

                  <Route
                    path="/leaves/types"
                    element={
                      <RoleRoute allow={['superadmin', 'hr']}>
                        <LeaveTypesPage />
                      </RoleRoute>
                    }
                  />
                  <Route path="/leaves/balances" element={<LeaveBalancePage />} />
                  <Route path="/leaves/request" element={<LeaveRequestPage />} />
                  <Route path="/leaves/history" element={<LeaveHistoryPage />} />
                  <Route
                    path="/leaves/approvals"
                    element={
                      <RoleRoute allow={['superadmin', 'hr', 'supervisor']}>
                        <LeaveApprovalPage />
                      </RoleRoute>
                    }
                  />

                  <Route
                    path="/reports"
                    element={
                      <RoleRoute allow={['superadmin', 'hr', 'supervisor']}>
                        <ReportsPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/reports/schedules"
                    element={
                      <RoleRoute allow={['superadmin', 'hr']}>
                        <ScheduledReportsPage />
                      </RoleRoute>
                    }
                  />

                  <Route
                    path="/ai/feed"
                    element={
                      <RoleRoute allow={['superadmin', 'hr', 'supervisor']}>
                        <AnomalyFeedPage />
                      </RoleRoute>
                    }
                  />

                  <Route
                    path="/settings/org"
                    element={
                      <RoleRoute allow={['superadmin', 'hr']}>
                        <OrganizationSettings />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/settings/policies"
                    element={
                      <RoleRoute allow={['superadmin', 'hr']}>
                        <PolicySettings />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/settings/integrations"
                    element={
                      <RoleRoute allow={['superadmin', 'hr']}>
                        <IntegrationsPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/settings/api-keys"
                    element={
                      <RoleRoute allow={['superadmin']}>
                        <APIKeysPage />
                      </RoleRoute>
                    }
                  />
                  <Route
                    path="/settings/roles"
                    element={
                      <RoleRoute allow={['superadmin', 'hr']}>
                        <RolesPermissionsPage />
                      </RoleRoute>
                    }
                  />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  background: '#1e293b',
                  color: '#f1f5f9',
                  border: '1px solid rgba(148,163,184,0.2)',
                  borderRadius: '12px',
                  fontSize: '14px',
                  boxShadow: '0 10px 30px -10px rgba(2,6,23,0.5)',
                },
                success: { iconTheme: { primary: '#6366f1', secondary: '#fff' } },
                error: { iconTheme: { primary: '#f43f5e', secondary: '#fff' } },
              }}
            />
          </BrowserRouter>
        </AttendanceProvider>
      </AuthProvider>
      </MotionConfig>
    </QueryClientProvider>
  </React.StrictMode>
);
