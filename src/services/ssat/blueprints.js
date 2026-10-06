import { SUBSKILLS } from './taxonomy.js';

/**
 * Test blueprints — the 30-minute budget, spent two different ways.
 * Changing test length/shape happens HERE and nowhere else.
 */

export const BLUEPRINTS = {
  /** Student knows their goal → spend the time proving where they stand. */
  'clear-v1': {
    key: 'clear-v1',
    label: 'Focused assessment',
    totalMinutes: 30,
    modules: [
      { key: 'goal',      label: 'Your goal',        kind: 'profiler',  minutes: 3,  items: 6 },
      { key: 'technical', label: 'Technical',        kind: 'ability',   minutes: 13, items: 12, dimension: 'technical', adaptive: true },
      { key: 'logical',   label: 'Logical & Aptitude', kind: 'ability', minutes: 5,  items: 6,  dimension: 'logical',   adaptive: true },
      { key: 'verbal',    label: 'English',          kind: 'ability',   minutes: 4,  items: 5,  dimension: 'verbal',    adaptive: true },
      { key: 'workstyle', label: 'How you work',     kind: 'inventory', minutes: 5,  items: 10, dimensions: ['psychological', 'emotional'] },
    ],
  },

  /** Student is unsure → spend the time finding a direction, screen broadly. */
  'discovery-v1': {
    key: 'discovery-v1',
    label: 'Goal discovery assessment',
    totalMinutes: 30,
    modules: [
      { key: 'goal',       label: 'About you',        kind: 'profiler',  minutes: 3, items: 6 },
      { key: 'discovery',  label: 'What fits you',    kind: 'discovery', minutes: 5, items: 8 },
      { key: 'technical',  label: 'Aptitude screen',  kind: 'ability',   minutes: 9, items: 9,
        dimension: 'technical', adaptive: true, measures: 'potential', broad: true },
      { key: 'logical',    label: 'Logical & Aptitude', kind: 'ability', minutes: 5, items: 6, dimension: 'logical', adaptive: true },
      { key: 'verbal',     label: 'English',          kind: 'ability',   minutes: 4, items: 5, dimension: 'verbal',  adaptive: true },
      { key: 'workstyle',  label: 'How you work',     kind: 'inventory', minutes: 4, items: 8, dimensions: ['psychological', 'emotional'] },
    ],
  },
};

/** Path B screens across domains rather than deep in one. */
export const BROAD_SCREEN_SUBSKILLS = [
  'programming-fundamentals', 'problem-solving', 'html-css',
  'design-fundamentals', 'testing-fundamentals', 'data-analysis',
];

/**
 * Path A: the subskills that matter most for the stated role.
 * Filtered by dimension — a role's importance map spans technical AND verbal/
 * logical subskills, and feeding e.g. 'reading-comprehension' into the technical
 * module just makes the item query miss and waste the budget.
 */
export function focusedSubskills(roleProfile, { dimension = 'technical', limit = 6 } = {}) {
  if (!roleProfile?.importance) return BROAD_SCREEN_SUBSKILLS;
  const pool = Object.entries(roleProfile.importance)
    .filter(([k]) => SUBSKILLS[k]?.dimension === dimension)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
  return pool.length ? pool : BROAD_SCREEN_SUBSKILLS;
}

export const getBlueprint = (key) => BLUEPRINTS[key];
