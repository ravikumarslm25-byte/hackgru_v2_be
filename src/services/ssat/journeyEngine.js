/**
 * Journey engine — turns a gap analysis into an ordered, time-estimated plan.
 *
 * DESIGN RULE (important): this is ROLE-FIRST, not CATALOGUE-FIRST.
 * We compute what the student needs to be hireable, then attach our courses to
 * whichever milestones we actually cover. Milestones we don't cover still appear,
 * with honest self-study alternatives. As the catalogue grows, courses attach
 * automatically via subskill overlap — no rework.
 */
import { SUBSKILLS, subskillLabel } from './taxonomy.js';
import { bandFor, BAND_MEANING } from './scoring.js';

/**
 * Priority = gap × importance × learnability × time-efficiency.
 * Highest priority = biggest movement per hour spent, weighted by job relevance.
 */
function priorityFor({ gap, importance, learnability }) {
  const timeEfficiency = learnability;          // easier to learn = faster payoff
  return gap * importance * (0.5 + learnability * 0.5) * timeEfficiency;
}

/** Hours to move a subskill from `from` to `to`, adjusted for learnability. */
function hoursToClose(from, to, learnability) {
  const gap = Math.max(0, to - from);
  if (gap === 0) return 0;
  // ~1.6 hrs per point at average learnability; harder skills cost more
  const base = gap * 1.6;
  return Math.round(base / Math.max(0.4, learnability));
}

export function analyseGaps({ ability, roleProfile }) {
  const required = roleProfile.requiredLevels || {};
  const importance = roleProfile.importance || {};
  const rows = [];

  for (const [subskill, target] of Object.entries(required)) {
    const meta = SUBSKILLS[subskill];
    if (!meta) continue;
    const est = ability[subskill];
    const current = est?.value ?? null;
    // Untested subskills are assumed low-but-unknown; flagged by confidence
    const assumed = current ?? 25;
    const gap = Math.max(0, target - assumed);
    const imp = importance[subskill] ?? 0.5;
    const learn = meta.learnability ?? 0.7;

    rows.push({
      subskill,
      label: meta.label,
      current: assumed,
      measured: current != null,
      confidence: est?.confidence ?? 0,
      target,
      gap,
      importance: imp,
      learnability: learn,
      hours: hoursToClose(assumed, target, learn),
      priority: priorityFor({ gap, importance: imp, learnability: learn }),
      band: bandFor(assumed),
    });
  }
  return rows.sort((a, b) => b.priority - a.priority);
}

/** Strengths worth telling them about — evidence-backed only. */
export function extractStrengths(gapRows) {
  return gapRows
    .filter((r) => r.measured && r.current >= 55)
    .sort((a, b) => b.current - a.current)
    .slice(0, 4)
    .map((r) => ({
      subskill: r.subskill, label: r.label, value: r.current,
      note: r.current >= r.target
        ? `Already at the level a junior hire needs. Keep it warm; don't spend more time here.`
        : `A real strength — you're close to the bar and this will carry you.`,
    }));
}

export function extractWeaknesses(gapRows) {
  return gapRows
    .filter((r) => r.gap > 10)
    .slice(0, 5)
    .map((r) => ({
      subskill: r.subskill, label: r.label, value: r.current, gap: Math.round(r.gap),
      note: r.measured
        ? `You're at ${Math.round(r.current)}; this role expects around ${r.target}. ${BAND_MEANING[r.band]}`
        : `Not tested in this sitting — treat as unknown. Likely a gap given the role's requirements.`,
    }));
}

/**
 * Attach one of our courses to a milestone — but only if it genuinely covers it.
 * Match = overlap between the milestone's subskills and the course's tags.
 */
function matchCourse(milestoneSubskills, courses) {
  let best = null, bestOverlap = 0;
  for (const c of courses) {
    const covered = (c.ssatSubskills || []).filter((s) => milestoneSubskills.includes(s));
    if (covered.length > bestOverlap) { bestOverlap = covered.length; best = c; }
  }
  // Require real overlap — don't upsell a course that barely touches the milestone
  return bestOverlap >= Math.max(1, Math.ceil(milestoneSubskills.length * 0.4)) ? best : null;
}

/** Honest self-study path, always shown alongside any course we sell. */
const ALTERNATIVES = {
  'programming-fundamentals': ['freeCodeCamp / CS50 (free)', 'Build 5 small programs from scratch, no tutorial'],
  'problem-solving': ['LeetCode Easy — 2 a day for 6 weeks (free)', 'NeetCode roadmap (free)'],
  'version-control': ['Git official docs + one team project (free)', 'Oh My Git! interactive game (free)'],
  'html-css': ['MDN + Frontend Mentor challenges (free)', 'Rebuild 3 real sites pixel-perfect'],
  'javascript': ['javascript.info (free)', 'Build 3 apps without a framework'],
  'frontend-framework': ['Official React docs — react.dev (free)', 'Rebuild an app you use daily'],
  'backend-basics': ['Node + Express official docs (free)', 'Build and deploy one REST API'],
  'databases': ['MongoDB University (free)', 'SQLBolt for relational basics (free)'],
  'system-design': ['System Design Primer on GitHub (free)', 'Read engineering blogs; sketch one design a week'],
  'design-fundamentals': ['Refactoring UI (paid book)', "Google's UX Design Certificate (paid)"],
  'ux-thinking': ['NN/g articles (free)', 'Run 5 usability tests on friends (free)'],
  'design-tools': ['Figma official tutorials (free)', 'Recreate 3 real app screens'],
  'testing-fundamentals': ['ISTQB Foundation syllabus (free to read)', 'Write test cases for an app you use'],
  'test-automation': ['Playwright/Selenium docs (free)', 'Automate a real site login flow'],
  'ai-assisted-dev': ['Build one project with AI tools, then review every line', 'Anthropic/OpenAI prompting docs (free)'],
  'xr-fundamentals': ['Unity Learn pathways (free)', 'Build one AR demo on your phone'],
  'data-analysis': ['Kaggle Learn (free)', 'Analyse one public dataset end-to-end'],
  'numerical-reasoning': ['IndiaBix / RS Aggarwal — 30 min daily', 'Timed mock aptitude tests'],
  'logical-reasoning': ['IndiaBix logical section (free)', 'Daily puzzle practice'],
  'pattern-recognition': ['Non-verbal reasoning practice sets', 'Timed pattern drills'],
  'data-interpretation': ['DI practice sets — placement-style', 'Practice reading charts under time pressure'],
  'reading-comprehension': ['Read one long-form article daily, summarise in 3 lines', 'Placement RC practice sets'],
  'grammar-usage': ['Grammarly handbook (free)', 'Daily error-spotting drills'],
  'written-expression': ['Write one technical explainer a week', 'Rewrite your resume bullets 3 times'],
};

const alternativesFor = (subskills) => {
  const out = [];
  for (const s of subskills) (ALTERNATIVES[s] || []).forEach((a) => out.includes(a) || out.push(a));
  return out.slice(0, 3);
};

/**
 * Build the ordered journey.
 * Milestones come from the role template (prerequisite order), but only those
 * with a real gap are included — we never make someone redo what they know.
 */
export function buildJourney({ gapRows, roleProfile, courses, hoursPerWeek = 8 }) {
  const gapBySubskill = Object.fromEntries(gapRows.map((r) => [r.subskill, r]));
  const template = roleProfile.milestoneTemplate || [];
  const milestones = [];
  let order = 1;

  for (const t of template) {
    const subs = (t.subskills || []).filter((s) => gapBySubskill[s]);
    if (!subs.length) continue;

    const rows = subs.map((s) => gapBySubskill[s]);
    const totalGap = rows.reduce((sum, r) => sum + r.gap, 0);
    if (totalGap < 8) continue;                        // already good enough — skip

    const hours = Math.max(t.baseHours || 0, rows.reduce((sum, r) => sum + r.hours, 0));
    const weeks = Math.max(1, Math.round(hours / Math.max(2, hoursPerWeek)));
    const course = matchCourse(subs, courses);

    milestones.push({
      order: order++,
      title: t.title,
      why: `${roleProfile.label} interviews test this directly. You're at ${Math.round(rows[0].current)} on ${rows[0].label}; the bar is about ${rows[0].target}.`,
      youWillLearn: subs.map(subskillLabel),
      youWillBuild: t.youWillBuild,
      proveIt: t.proveIt,
      subskills: subs,
      estimatedHours: hours,
      estimatedWeeks: weeks,
      ourCourse: course ? { slug: course.slug, title: course.title, price: course.price } : undefined,
      alternatives: alternativesFor(subs),
    });
  }

  return milestones;
}

/**
 * The honesty check. If the maths doesn't work, say so and offer a real target.
 */
/** Fraction of an untested subskill we're willing to credit. Unknown ≠ nearly there. */
const UNMEASURED_CREDIT_CAP = 0.35;

export function assessReadiness({ gapRows, journey, roleProfile, timelineWeeks, hoursPerWeek }) {
  const requiredHours = journey.reduce((s, m) => s + m.estimatedHours, 0);
  const availableHours = (timelineWeeks || 12) * (hoursPerWeek || 8);

  // Readiness = weighted coverage of the role's requirements.
  //
  // Two corrections that matter:
  //  1. Untested subskills are capped — "we never checked" must not read as
  //     "nearly met" just because the role's bar happens to be low there.
  //  2. Coverage is raised to a power >1 so distance from the bar is penalised
  //     non-linearly. Being 60% of the way to hireable is NOT 60% hireable;
  //     the last stretch is the hard part, and a linear scale flatters people
  //     into applying too early.
  let sum = 0, weight = 0;
  let measuredWeight = 0;
  for (const r of gapRows) {
    let ratio = Math.min(1, r.current / Math.max(1, r.target));
    if (!r.measured) ratio = Math.min(ratio, UNMEASURED_CREDIT_CAP);
    const coverage = Math.pow(ratio, 1.5);
    sum += coverage * r.importance;
    weight += r.importance;
    if (r.measured) measuredWeight += r.importance;
  }
  const overall = weight ? Math.round((sum / weight) * 100) : 0;
  // How much of this verdict rests on things we actually tested
  const evidenceCoverage = weight ? Math.round((measuredWeight / weight) * 100) : 0;

  const band =
    overall >= 80 ? 'interview-ready' :
    overall >= 55 ? 'building' :
    overall >= 30 ? 'foundation' : 'exploring';

  const feasible = requiredHours <= availableHours * 1.1;
  const suggestedTimelineWeeks = Math.ceil(requiredHours / Math.max(2, hoursPerWeek || 8));

  let verdict;
  if (feasible) {
    verdict = `Your plan needs about ${requiredHours} hours. At ${hoursPerWeek} hrs/week over ${timelineWeeks} weeks you have roughly ${availableHours} — that works, with room for life to happen.`;
  } else {
    const shortfall = requiredHours - availableHours;
    verdict = `Being straight with you: this plan needs about ${requiredHours} hours, and ${timelineWeeks} weeks at ${hoursPerWeek} hrs/week gives you ${availableHours}. You're short by roughly ${shortfall}. Two honest options — extend to about ${suggestedTimelineWeeks} weeks, or raise to ${Math.ceil(requiredHours / Math.max(1, timelineWeeks))} hrs/week. Rushing it produces someone who can't answer follow-up questions in an interview, which is worse than arriving later.`;
  }

  return {
    overall, band, verdict, feasible, evidenceCoverage,
    requiredHours, availableHours, suggestedTimelineWeeks,
  };
}

/** Concrete actions for week one. Vague advice helps nobody. */
export function buildFirstWeek(journey, gapRows) {
  const m = journey[0];
  const actions = [];
  if (!m) return ['Take the assessment again once you have picked a direction.'];

  actions.push(`Block ${Math.min(10, Math.ceil(m.estimatedHours / Math.max(1, m.estimatedWeeks)))} hours in your calendar this week — actual slots, not "when I'm free".`);
  if (m.ourCourse) actions.push(`Start "${m.ourCourse.title}" — it covers ${m.youWillLearn.slice(0, 2).join(' and ')} directly.`);
  else if (m.alternatives?.length) actions.push(`Start here: ${m.alternatives[0]}`);
  actions.push(`Begin the build: ${m.youWillBuild}`);
  actions.push(`Set up a public GitHub repo today, even if it's empty. Commit something small every day this week.`);
  const weakAptitude = gapRows.find((r) => ['numerical-reasoning', 'logical-reasoning'].includes(r.subskill) && r.gap > 15);
  if (weakAptitude) actions.push(`30 minutes of aptitude practice daily — most campus placements screen on this before anyone reads your resume.`);
  return actions;
}

export function buildCheckpoints(journey) {
  const cps = [];
  if (journey.length >= 2) cps.push({ afterMilestone: 2, retestDimensions: ['technical'], note: 'Retest technical — you should see real movement here. If not, the plan needs adjusting, not more effort.' });
  if (journey.length >= 4) cps.push({ afterMilestone: 4, retestDimensions: ['technical', 'logical', 'verbal'], note: 'Full retest. This is the point to start applying, not after you feel "ready" — nobody ever feels ready.' });
  return cps;
}
