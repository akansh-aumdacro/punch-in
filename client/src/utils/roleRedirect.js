export function dashboardPathForRole(role) {
  switch (role) {
    case 'superadmin':
      return '/admin/dashboard';
    case 'hr':
      return '/hr/dashboard';
    case 'supervisor':
      return '/supervisor/dashboard';
    case 'agency_admin':
      return '/agency/dashboard';
    case 'worker':
    default:
      return '/worker/dashboard';
  }
}
