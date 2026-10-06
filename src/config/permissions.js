/**
 * The permission catalog. Each key gates a slice of the admin panel. Roles are
 * built from these; a user's effective permissions come from their role.
 * 'admin' is a superuser and implicitly holds every permission.
 */
export const PERMISSION_GROUPS = [
  { group: 'People', perms: [['students.manage', 'Students & resumes']] },
  { group: 'Institutions', perms: [
    ['colleges.manage', 'Colleges & college staff'],
    ['batches.manage', 'Batches & registration links'],
  ] },
  { group: 'Catalogue', perms: [
    ['courses.manage', 'Courses, recordings, tests, coding, categories, materials'],
    ['certificates.manage', 'Certificates'],
  ] },
  { group: 'Commerce', perms: [
    ['products.manage', 'Store products'],
    ['billing.manage', 'Billing & invoices'],
  ] },
  { group: 'Insights', perms: [['reports.view', 'Reports']] },
  { group: 'Support', perms: [['tickets.manage', 'Support tickets']] },
  { group: 'Administration', perms: [['users.manage', 'Users, roles & settings']] },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.perms.map((p) => p[0]));
export const isValidPermission = (k) => ALL_PERMISSIONS.includes(k);
