/**
 * The shared skill vocabulary for SSAT.
 * Every item, role profile and report speaks in these keys.
 * Add new subskills here first — everything else reads from this file.
 */

export const DIMENSIONS = {
  technical:     { label: 'Technical',              kind: 'ability'   },
  logical:       { label: 'Logical & Aptitude',     kind: 'ability'   },
  verbal:        { label: 'English Communication',  kind: 'ability'   },
  emotional:     { label: 'Working with People',    kind: 'inventory' },
  psychological: { label: 'How You Work',           kind: 'inventory' },
};

/** Ability subskills. `domain` groups them for broad (Path B) screening. */
export const SUBSKILLS = {
  // --- foundations (everyone) ---
  'programming-fundamentals': { label: 'Programming Fundamentals', dimension: 'technical', domain: 'foundation', learnability: 0.9 },
  'problem-solving':          { label: 'Problem Solving & DSA',    dimension: 'technical', domain: 'foundation', learnability: 0.7 },
  'version-control':          { label: 'Git & Version Control',    dimension: 'technical', domain: 'foundation', learnability: 0.95 },

  // --- development ---
  'html-css':          { label: 'HTML & CSS',             dimension: 'technical', domain: 'development', learnability: 0.9 },
  'javascript':        { label: 'JavaScript',             dimension: 'technical', domain: 'development', learnability: 0.8 },
  'frontend-framework':{ label: 'React / Frontend',       dimension: 'technical', domain: 'development', learnability: 0.8 },
  'backend-basics':    { label: 'Backend & APIs',         dimension: 'technical', domain: 'development', learnability: 0.75 },
  'databases':         { label: 'Databases',              dimension: 'technical', domain: 'development', learnability: 0.8 },
  'system-design':     { label: 'System Design',          dimension: 'technical', domain: 'development', learnability: 0.5 },

  // --- design ---
  'design-fundamentals':{ label: 'Design Fundamentals',   dimension: 'technical', domain: 'design', learnability: 0.75 },
  'ux-thinking':        { label: 'UX Thinking',           dimension: 'technical', domain: 'design', learnability: 0.65 },
  'design-tools':       { label: 'Figma & Design Tools',  dimension: 'technical', domain: 'design', learnability: 0.9 },

  // --- testing / QA ---
  'testing-fundamentals':{ label: 'Testing Fundamentals', dimension: 'technical', domain: 'testing', learnability: 0.85 },
  'test-automation':     { label: 'Test Automation',      dimension: 'technical', domain: 'testing', learnability: 0.75 },

  // --- emerging ---
  'ai-assisted-dev': { label: 'AI-Assisted Development', dimension: 'technical', domain: 'emerging', learnability: 0.85 },
  'xr-fundamentals': { label: 'AR/VR Fundamentals',      dimension: 'technical', domain: 'emerging', learnability: 0.6 },
  'data-analysis':   { label: 'Data & Analytics',        dimension: 'technical', domain: 'data',     learnability: 0.7 },

  // --- cross-cutting placement skills ---
  'numerical-reasoning':{ label: 'Numerical Reasoning',   dimension: 'logical', domain: 'aptitude', learnability: 0.8 },
  'logical-reasoning':  { label: 'Logical Reasoning',     dimension: 'logical', domain: 'aptitude', learnability: 0.75 },
  'pattern-recognition':{ label: 'Pattern Recognition',   dimension: 'logical', domain: 'aptitude', learnability: 0.6 },
  'data-interpretation':{ label: 'Data Interpretation',   dimension: 'logical', domain: 'aptitude', learnability: 0.8 },

  'reading-comprehension':{ label: 'Reading Comprehension', dimension: 'verbal', domain: 'verbal', learnability: 0.7 },
  'grammar-usage':        { label: 'Grammar & Usage',       dimension: 'verbal', domain: 'verbal', learnability: 0.85 },
  'written-expression':   { label: 'Written Expression',    dimension: 'verbal', domain: 'verbal', learnability: 0.7 },
};

/** Inventory dimensions — profiled, never scored. */
export const WORKSTYLE_TRAITS = {
  structure:      { label: 'Structure vs. autonomy', poles: ['Prefers clear structure', 'Prefers autonomy'] },
  depth:          { label: 'Depth vs. breadth',      poles: ['Goes deep on one thing', 'Explores broadly'] },
  pace:           { label: 'Pace',                   poles: ['Steady and thorough', 'Fast and iterative'] },
  collaboration:  { label: 'Collaboration',          poles: ['Works best alone', 'Works best with others'] },
  feedback:       { label: 'Response to feedback',   poles: ['Reflects privately first', 'Discusses openly'] },
  persistence:    { label: 'When stuck',             poles: ['Pushes through alone', 'Asks for help early'] },
};

export const EQ_FACETS = {
  'self-awareness':  { label: 'Self-awareness' },
  'regulation':      { label: 'Staying steady under pressure' },
  'empathy':         { label: 'Reading other people' },
  'collaboration':   { label: 'Working in a team' },
  'growth-mindset':  { label: 'Response to setbacks' },
};

/** Interest axes — what kind of work energises you. */
export const INTEREST_AXES = {
  build:   { label: 'Building things',        roles: ['frontend-developer', 'backend-developer', 'fullstack-developer', 'mobile-developer'] },
  analyse: { label: 'Analysing & finding problems', roles: ['qa-engineer', 'data-analyst'] },
  design:  { label: 'Designing experiences',  roles: ['ui-ux-designer', 'frontend-developer'] },
  explore: { label: 'Exploring new tech',     roles: ['xr-developer', 'ai-engineer'] },
  lead:    { label: 'Coordinating people',    roles: ['business-analyst', 'fullstack-developer'] },
};

export const subskillLabel = (key) => SUBSKILLS[key]?.label || key;
export const subskillsInDomain = (domain) =>
  Object.entries(SUBSKILLS).filter(([, v]) => v.domain === domain).map(([k]) => k);
