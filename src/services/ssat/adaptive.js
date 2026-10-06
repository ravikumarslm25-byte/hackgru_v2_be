/**
 * Adaptive item selection.
 * Picks the item that tells us the most, given what we already believe.
 * This is what makes a 30-minute test viable.
 */
import { Item } from '../../models/ssat/Item.js';

/** Ability value → the difficulty band that yields most information. */
function targetDifficulty(ability) {
  if (ability == null) return 3;
  if (ability < 25) return 1;
  if (ability < 42) return 2;
  if (ability < 62) return 3;
  if (ability < 80) return 4;
  return 5;
}

/**
 * Select the next item for a module.
 * - Never repeats an item already served in this session
 * - Prefers the subskill with the least evidence (spread the budget)
 * - Targets difficulty at the current ability estimate
 * - Falls back outward if the bank is thin at that difficulty
 */
export async function selectNextItem({ session, dimension, subskillPool, measures }) {
  const ability = session.ability || {};

  // Which subskill do we know least about?
  const ranked = [...subskillPool].sort((a, b) => {
    const na = ability[a]?.n ?? 0;
    const nb = ability[b]?.n ?? 0;
    if (na !== nb) return na - nb;
    return (ability[a]?.confidence ?? 0) - (ability[b]?.confidence ?? 0);
  });

  for (const subskill of ranked) {
    const est = ability[subskill]?.value;
    const target = targetDifficulty(est);

    // Try target difficulty, then widen: ±1, ±2
    for (const spread of [0, 1, 2]) {
      const lo = Math.max(1, target - spread);
      const hi = Math.min(5, target + spread);
      const query = {
        dimension,
        subskills: subskill,
        difficulty: { $gte: lo, $lte: hi },
        status: 'live',
        isPublished: true,
        _id: { $nin: session.servedItemIds || [] },
      };
      if (measures) query.measures = measures;

      const candidates = await Item.find(query).limit(12).lean();
      if (candidates.length) {
        // Random among the best-fitting — per-attempt sampling deters sharing
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
    }
  }

  // Nothing left in the pool for this dimension
  const fallback = await Item.find({
    dimension, status: 'live', isPublished: true,
    _id: { $nin: session.servedItemIds || [] },
  }).limit(8).lean();
  return fallback.length ? fallback[Math.floor(Math.random() * fallback.length)] : null;
}

/** Inventory items are not adaptive — serve in a stable shuffled order. */
export async function selectInventoryItem({ session, dimension }) {
  const items = await Item.find({
    dimension, status: 'live', isPublished: true,
    _id: { $nin: session.servedItemIds || [] },
  }).limit(30).lean();
  return items.length ? items[0] : null;
}

/**
 * Should we stop testing this subskill? Stop early when confident —
 * that's the time we spend elsewhere.
 */
export function hasEnoughEvidence(ability, subskill, minConfidence = 0.7) {
  const est = ability?.[subskill];
  return Boolean(est && est.confidence >= minConfidence && est.n >= 3);
}
