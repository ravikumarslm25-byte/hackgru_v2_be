/**
 * Deterministic scoring engine.
 *
 * RULES:
 *  - Runs server-side only. Correct answers never leave this process.
 *  - Pure functions: same responses in → same scores out, always.
 *  - No AI anywhere in this file. AI narrates results; it never computes them.
 */
import { SUBSKILLS } from './taxonomy.js';

/** Difficulty (1-5) → the ability level an item discriminates around. */
const DIFFICULTY_ANCHOR = { 1: 20, 2: 35, 3: 50, 4: 70, 5: 88 };

/** How much a single response moves the estimate. Shrinks as evidence accumulates. */
const kFactor = (n) => Math.max(6, 24 - n * 3);

/**
 * Elo-style ability update.
 * Getting a hard item right moves you up more than getting an easy one right.
 * Chosen over full IRT deliberately: IRT needs thousands of calibrated responses.
 * The Item.stats fields collect exactly that data for a later migration.
 */
export function updateAbility(current, { correct, difficulty }) {
  const value = current?.value ?? 50;
  const n = current?.n ?? 0;

  const anchor = DIFFICULTY_ANCHOR[difficulty] ?? 50;
  // Probability the student answers correctly, logistic on the gap
  const expected = 1 / (1 + Math.pow(10, (anchor - value) / 25));
  const actual = correct ? 1 : 0;

  const next = value + kFactor(n) * (actual - expected);
  const clamped = Math.max(0, Math.min(100, next));

  return {
    value: Math.round(clamped * 10) / 10,
    n: n + 1,
    confidence: confidenceFor(n + 1),
  };
}

/**
 * Confidence from evidence count. Deliberately conservative:
 * a 30-minute test cannot claim precision it hasn't earned.
 */
export function confidenceFor(n) {
  if (n <= 0) return 0;
  if (n === 1) return 0.25;
  if (n === 2) return 0.45;
  if (n === 3) return 0.6;
  if (n === 4) return 0.7;
  if (n <= 6) return 0.8;
  return 0.88;
}

export const confidenceLabel = (c) =>
  c >= 0.75 ? 'high' : c >= 0.55 ? 'medium' : c >= 0.3 ? 'low' : 'indicative';

/** Band a raw score into words students understand. */
export function bandFor(value) {
  if (value >= 80) return 'strong';
  if (value >= 60) return 'competent';
  if (value >= 40) return 'developing';
  if (value >= 20) return 'beginner';
  return 'not-started';
}

export const BAND_MEANING = {
  strong:       'You can work independently here and help others.',
  competent:    'You can build with this, with occasional help.',
  developing:   'You know the basics but need practice under real conditions.',
  beginner:     'You have been exposed to this but cannot yet apply it.',
  'not-started':'This is new territory for you.',
};

/**
 * Score a batch of responses into per-subskill ability estimates.
 * Composite items (multiple subskills) credit each subskill they load on.
 */
export function scoreResponses(responses) {
  const ability = {};
  for (const r of responses) {
    if (r.correct === null || r.correct === undefined) continue; // inventory item
    const subs = r.subskills?.length ? r.subskills : [];
    for (const s of subs) {
      ability[s] = updateAbility(ability[s], { correct: r.correct, difficulty: r.difficulty || 3 });
    }
  }
  return ability;
}

/** Roll subskills up to dimension level, weighted by evidence. */
export function rollUpDimensions(subskillScores) {
  const byDim = {};
  for (const [key, est] of Object.entries(subskillScores)) {
    const dim = SUBSKILLS[key]?.dimension;
    if (!dim) continue;
    byDim[dim] ??= { sum: 0, weight: 0, n: 0 };
    const w = est.confidence || 0.3;
    byDim[dim].sum += est.value * w;
    byDim[dim].weight += w;
    byDim[dim].n += est.n || 1;
  }
  const out = {};
  for (const [dim, v] of Object.entries(byDim)) {
    const value = v.weight ? Math.round((v.sum / v.weight) * 10) / 10 : 0;
    out[dim] = { value, confidence: confidenceFor(v.n), band: bandFor(value), items: v.n };
  }
  return out;
}

/** Inventory scoring: map responses onto trait poles / EQ facets. No right answers. */
export function scoreInventory(responses) {
  const traits = {};
  const facets = {};
  for (const r of responses) {
    if (!r.scoreMap) continue;
    const contrib = r.scoreMap[r.chosenKey];
    if (!contrib) continue;
    for (const [k, v] of Object.entries(contrib)) {
      if (k.startsWith('eq:')) {
        const f = k.slice(3);
        facets[f] ??= { sum: 0, n: 0 };
        facets[f].sum += v; facets[f].n += 1;
      } else {
        traits[k] ??= { sum: 0, n: 0 };
        traits[k].sum += v; traits[k].n += 1;
      }
    }
  }
  const norm = (o) => Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, Math.round((v.sum / Math.max(1, v.n)) * 100) / 100])
  );
  return { traits: norm(traits), facets: norm(facets) };
}
