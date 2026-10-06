/**
 * Seeds the SSAT engine: role profiles + item bank.
 * Run standalone:  npm run seed:ssat
 * Also called from the main seed.
 */
import mongoose from 'mongoose';
import { connectDB } from '../../config/db.js';
import { Item } from '../../models/ssat/Item.js';
import { RoleProfile } from '../../models/ssat/RoleProfile.js';
import { Session } from '../../models/ssat/Session.js';
import { Result } from '../../models/ssat/Result.js';
import { itemsData } from './items.data.js';
import { inventoryData } from './inventory.data.js';
import { rolesData } from './roles.data.js';
import { DISCOVERY_SCORE_MAP } from './profiler.data.js';

export async function seedSsat({ clearSessions = true } = {}) {
  await Item.deleteMany({});
  await RoleProfile.deleteMany({});
  if (clearSessions) { await Session.deleteMany({}); await Result.deleteMany({}); }

  const items = await Item.insertMany([...itemsData, ...inventoryData]);
  const roles = await RoleProfile.insertMany(rolesData);

  const byDim = items.reduce((a, i) => { a[i.dimension] = (a[i.dimension] || 0) + 1; return a; }, {});
  console.log(`✓ SSAT items: ${items.length}`, byDim);
  console.log(`✓ SSAT roles: ${roles.length} (${roles.map((r) => r.role).join(', ')})`);
  console.warn('⚠️  Item bank is a STARTER SET — needs mentor review and expansion toward ~700 items.');
  console.warn('⚠️  Role requiredLevels/importance are DRAFT estimates — need mentor validation.');
  return { items: items.length, roles: roles.length };
}

// Standalone runner
if (process.argv[1]?.endsWith('seedSsat.js')) {
  connectDB()
    .then(() => seedSsat())
    .then(async () => { await mongoose.connection.close(); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
