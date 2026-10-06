import { Batch } from '../../models/org/Batch.js';

/** react-full-stack → RFS · ar-vr-development → AVD · vibe-coding → VC */
const abbreviate = (slug = '') =>
  slug.split(/[-_\s]+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase().slice(0, 4) || 'GEN';

/**
 * Human-readable, unique batch code: ANNA-CHN-CSE-RFS-01
 * Someone should be able to read it out on a phone call.
 */
export async function generateBatchCode({ collegeCode, departmentCode, courseSlug }) {
  const stem = [collegeCode, departmentCode, abbreviate(courseSlug)]
    .map((p) => String(p || '').toUpperCase().replace(/[^A-Z0-9-]/g, ''))
    .filter(Boolean)
    .join('-');

  // Sequence within this college+department+course, so numbers stay small and meaningful.
  const existing = await Batch.countDocuments({ code: new RegExp(`^${stem}-\\d+$`) });
  let n = existing + 1;

  // countDocuments can race or miss a deleted middle — verify before returning.
  for (let i = 0; i < 50; i++) {
    const code = `${stem}-${String(n).padStart(2, '0')}`;
    if (!(await Batch.exists({ code }))) return code;
    n += 1;
  }
  return `${stem}-${Date.now().toString(36).toUpperCase()}`;
}
