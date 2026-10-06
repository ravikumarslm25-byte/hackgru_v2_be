/**
 * Profiler + discovery questions. Static (not DB items) — they never change
 * per student and carry no correct answers.
 */

export const PROFILER_QUESTIONS = [
  // NOTE: no "do you know your goal?" question here — the path chooser already
  // asks exactly that, and asking twice makes the assessment feel broken.
  { id: 'p-role', field: 'role', type: 'mcq', meta: { dynamicRoles: true },
    stem: 'Which role are you aiming for?',
    // Options are resolved SERVER-SIDE from the RoleProfile collection
    // (see resolveOptions in ssatController). Never leave this to the client:
    // if the roles aren't seeded the student gets an unanswerable question.
    options: [] },
  { id: 'p-year', field: 'year', type: 'mcq',
    stem: 'Where are you in your studies?',
    options: [
      { key: '1', text: '1st year' }, { key: '2', text: '2nd year' },
      { key: '3', text: '3rd year' }, { key: '4', text: 'Final year' },
      { key: 'grad', text: 'Graduated, looking for work' },
      { key: 'working', text: 'Working, want to switch' },
    ]},
  { id: 'p-timeline', field: 'timelineWeeks', type: 'mcq',
    stem: 'When do you need to be interview-ready?',
    options: [
      { key: '8', text: 'Within 2 months — placements are close' },
      { key: '12', text: 'About 3 months' },
      { key: '24', text: 'About 6 months' },
      { key: '52', text: 'A year or more — I have time' },
    ]},
  { id: 'p-hours', field: 'hoursPerWeek', type: 'mcq',
    stem: 'Realistically, how many hours a week can you actually study? Be honest — the plan is built on this number.',
    options: [
      { key: '4', text: 'About 4 — classes are heavy' },
      { key: '8', text: 'About 8' },
      { key: '15', text: 'About 15' },
      { key: '25', text: '25+ — this is my main focus' },
    ]},
  { id: 'p-experience', field: 'experience', type: 'mcq',
    stem: 'How much have you actually built so far?',
    options: [
      { key: 'none', text: 'Nothing yet — only classroom work' },
      { key: 'tutorial', text: 'Followed tutorials, built along with them' },
      { key: 'small', text: 'Built 1–2 small things on my own' },
      { key: 'several', text: 'Several projects, some deployed' },
    ]},
];

/**
 * Discovery module — evidence over aspiration, trade-offs over ratings,
 * and real work samples. Each option maps to interest axes.
 */
export const DISCOVERY_QUESTIONS = [
  { id: 'd-lost-time', type: 'mcq',
    stem: 'Think about the last time you lost track of time. What were you doing?',
    options: [
      { key: 'build', text: 'Making something work — code, a machine, a setup' },
      { key: 'analyse', text: 'Digging into why something broke or behaved oddly' },
      { key: 'design', text: 'Arranging how something looks or flows' },
      { key: 'explore', text: 'Going down a rabbit hole on something new' },
      { key: 'lead', text: 'Organising people around a plan' },
    ]},
  { id: 'd-tradeoff-1', type: 'tradeoff',
    stem: 'Pick one. Three hours, alone:',
    options: [
      { key: 'build', text: 'Debug a hard problem until it finally works' },
      { key: 'lead', text: 'Run a meeting to get five people aligned' },
    ]},
  { id: 'd-tradeoff-2', type: 'tradeoff',
    stem: 'Which failure would bother you more?',
    options: [
      { key: 'design', text: 'You shipped it, and users found it confusing' },
      { key: 'analyse', text: 'You shipped it, and it broke in production' },
    ]},
  { id: 'd-work-sample-dev', type: 'work-sample',
    stem: "A real Tuesday for a backend developer: You open a ticket saying checkout fails for 2% of users. You read logs for 40 minutes, find a race condition when two requests hit at once, write a fix, add a test that reproduces it, and open a PR. A teammate leaves 6 comments. You address them and merge.\n\nHonest reaction?",
    options: [
      { key: 'love', text: 'That sounds genuinely satisfying' },
      { key: 'ok', text: 'Fine — I could do that' },
      { key: 'dull', text: 'Sounds tedious' },
      { key: 'lost', text: "I don't really understand what that involves" },
    ]},
  { id: 'd-work-sample-design', type: 'work-sample',
    stem: "A real Tuesday for a UI/UX designer: Users are dropping off at signup. You watch 5 session recordings, notice everyone hesitates at one field, sketch 3 alternatives, mock them in Figma, and present to engineering — who tell you two are too expensive to build. You rework the third.\n\nHonest reaction?",
    options: [
      { key: 'love', text: 'That sounds genuinely satisfying' },
      { key: 'ok', text: 'Fine — I could do that' },
      { key: 'dull', text: 'Sounds tedious' },
      { key: 'lost', text: "I don't really understand what that involves" },
    ]},
  { id: 'd-work-sample-qa', type: 'work-sample',
    stem: "A real Tuesday for a QA engineer: Release is Thursday. You write 30 test cases for the new payments flow, find 4 bugs, one of which only happens on slow networks. You write a script that reproduces it reliably, file it with exact steps, and the developer fixes it in an hour because your report was that clear.\n\nHonest reaction?",
    options: [
      { key: 'love', text: 'That sounds genuinely satisfying' },
      { key: 'ok', text: 'Fine — I could do that' },
      { key: 'dull', text: 'Sounds tedious' },
      { key: 'lost', text: "I don't really understand what that involves" },
    ]},
  { id: 'd-motivation', type: 'mcq',
    stem: 'Be honest about why you want a tech job:',
    options: [
      { key: 'money', text: 'Salary and stability, mainly' },
      { key: 'craft', text: 'I actually enjoy building things' },
      { key: 'family', text: 'Family expectation — it is what you do' },
      { key: 'unsure', text: "Everyone's doing it and I don't know what else" },
    ]},
  { id: 'd-blocker', type: 'mcq',
    stem: "What's actually been stopping you so far?",
    options: [
      { key: 'direction', text: "I don't know what to learn first" },
      { key: 'consistency', text: 'I start and then stop after a week' },
      { key: 'confidence', text: 'I think I am not smart enough for this' },
      { key: 'time', text: 'Genuinely no time — college is relentless' },
      { key: 'nothing', text: 'Nothing — I just started' },
    ]},
];

/** Maps discovery answers → interest axis contributions (deterministic). */
export const DISCOVERY_SCORE_MAP = {
  'd-lost-time': {
    build:   { 'interest:build': 1 },   analyse: { 'interest:analyse': 1 },
    design:  { 'interest:design': 1 },  explore: { 'interest:explore': 1 },
    lead:    { 'interest:lead': 1 },
  },
  'd-tradeoff-1': { build: { 'interest:build': 0.8, 'interest:lead': -0.5 }, lead: { 'interest:lead': 0.8, 'interest:build': -0.3 } },
  'd-tradeoff-2': { design: { 'interest:design': 0.8 }, analyse: { 'interest:analyse': 0.8 } },
  'd-work-sample-dev':    { love: { 'interest:build': 1 },   ok: { 'interest:build': 0.3 },   dull: { 'interest:build': -0.8 },   lost: {} },
  'd-work-sample-design': { love: { 'interest:design': 1 },  ok: { 'interest:design': 0.3 },  dull: { 'interest:design': -0.8 },  lost: {} },
  'd-work-sample-qa':     { love: { 'interest:analyse': 1 }, ok: { 'interest:analyse': 0.3 }, dull: { 'interest:analyse': -0.8 }, lost: {} },
};
