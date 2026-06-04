import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { MotionConfig } from 'framer-motion';

import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { AttendanceProvider } from './context/AttendanceContext.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';
import ProtectedRoute from './pages/auth/ProtectedRoute.jsx';
import RoleRoute from './pages/auth/RoleRoute.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import SuperAdminDashboard from './pages/dashboard/SuperAdminDashboard.jsx';
import HRDashboard from './pages/dashboard/HRDashboard.jsx';
import SupervisorDashboard from './pages/dashboard/SupervisorDashboard.jsx';
import WorkerDashboard from './pages/dashboard/WorkerDashboard.jsx';
import AgencyDashboard from './pages/dashboard/AgencyDashboard.jsx';
import WorkerListPage from './pages/workers/WorkerListPage.jsx';
import WorkerFormPage from './pages/workers/WorkerFormPage.jsx';
import SiteListPage from './pages/sites/SiteListPage.jsx';
import SiteFormPage from './pages/sites/SiteFormPage.jsx';
import LiveDashboardPage from './pages/attendance/LiveDashboardPage.jsx';
import AttendanceLogsPage from './pages/attendance/AttendanceLogsPage.jsx';
import ClockInPage from './pages/attendance/ClockInPage.jsx';
import FaceEnrollmentPage from './pages/face/FaceEnrollmentPage.jsx';
import ShiftTemplatesPage from './pages/shifts/ShiftTemplatesPage.jsx';
import ShiftSchedulerPage from './pages/shifts/ShiftSchedulerPage.jsx';
import ShiftSwapPage from './pages/shifts/ShiftSwapPage.jsx';
import WeeklyOffPage from './pages/shifts/WeeklyOffPage.jsx';
import TimesheetListPage from './pages/timesheets/TimesheetListPage.jsx';
import TimesheetDetailPage from './pages/timesheets/TimesheetDetailPage.jsx';
import TimesheetApprovalQueue from './pages/timesheets/TimesheetApprovalQueue.jsx';
import LeaveTypesPage from './pages/leaves/LeaveTypesPage.jsx';
import LeaveBalancePage from './pages/leaves/LeaveBalancePage.jsx';
import LeaveRequestPage from './pages/leaves/LeaveRequestPage.jsx';
import LeaveApprovalPage from './pages/leaves/LeaveApprovalPage.jsx';
import LeaveHistoryPage from './pages/leaves/LeaveHistoryPage.jsx';
import ReportsPage from './pages/reports/ReportsPage.jsx';
import ScheduledReportsPage from './pages/reports/ScheduledReportsPage.jsx';
import AnomalyFeedPage from './pages/ai/AnomalyFeedPage.jsx';
import OrganizationSettings from './pages/settings/OrganizationSettings.jsx';
import PolicySettings from './pages/settings/PolicySettings.jsx';
import IntegrationsPage from './pages/settings/IntegrationsPage.jsx';
import APIKeysPage from './pages/settings/APIKeysPage.jsx';
import RolesPermissionsPage from './pages/settings/RolesPermissionsPage.jsx';
import { dashboardPathForRole } from './utils/roleRedirect';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
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

                  <Route path="/agencies" element={<DashboardPlaceholder title="Agencies (UI coming soon)" />} />

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
