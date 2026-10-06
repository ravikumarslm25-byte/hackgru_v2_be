/**
 * What a college SPOC can be granted. Nothing here is implied — a SPOC gets
 * exactly what an admin ticks.
 */
export const SPOC_PERMISSIONS = {
  'students:view':   'See the students in their scope',
  'students:contact':'See student email and phone',
  'batches:view':    'See batches and seat counts',
  'progress:view':   'See course progress and attendance',
  'ssat:view':       'See SSAT ability scores (never the work-style/EQ profile)',
  'reports:view':    'See and download submitted project reports',
  'payments:view':   'See payment status AND amounts',
  'export':          'Export lists to CSV',
};

/**
 * Sensible defaults for a new SPOC.
 *
 * `payments:view` is deliberately OFF. A SPOC seeing that a student paid is one
 * thing; seeing what they paid is financial data about a minor's family, and it
 * exposes any per-college pricing you negotiated. Grant it deliberately.
 */
export const DEFAULT_SPOC_PERMISSIONS = [
  'students:view', 'students:contact', 'batches:view', 'progress:view', 'reports:view',
];

export const isValidPermission = (p) => Object.hasOwn(SPOC_PERMISSIONS, p);
