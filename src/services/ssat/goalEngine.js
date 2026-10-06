/**
 * Goal discovery — triangulates Interest × Aptitude × Market.
 *
 * DETERMINISTIC BY DESIGN. AI runs the conversation and writes the prose,
 * but the ranking is rules-based so we can always answer "why did you
 * suggest this?" with actual evidence.
 */
import { INTEREST_AXES, SUBSKILLS, subskillLabel } from './taxonomy.js';

/** Interest score for a role: how strongly their answers point at its axes. */
function interestFor(role, roleProfile, interests) {
  const axes = roleProfile.interestAxes || [];
  if (!axes.length) return 50;
  const vals = axes.map((a) => interests[a] ?? 50);
  return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

/** Aptitude score: how the measured ability sits against what the role needs. */
function aptitudeFor(roleProfile, ability) {
  const importance = roleProfile.importance || {};
  const required = roleProfile.requiredLevels || {};
  let sum = 0, weight = 0;

  for (const [subskill, imp] of Object.entries(importance)) {
    const est = ability[subskill];
    const target = required[subskill] ?? 60;
    if (!est) continue;
    // Ratio of current to target, capped — exceeding target doesn't inflate further
    const ratio = Math.min(1.2, est.value / Math.max(1, target));
    // Weight by both importance and how much we trust the estimate
    const w = imp * (est.confidence || 0.3);
    sum += ratio * w;
    weight += w;
  }
  if (!weight) return null;                    // no evidence — be honest
  return Math.round(Math.min(100, (sum / weight) * 80));
}

/** Learnability-adjusted potential: no evidence yet, but is this reachable? */
function potentialFor(roleProfile, ability) {
  const importance = roleProfile.importance || {};
  const foundations = ['programming-fundamentals', 'problem-solving', 'logical-reasoning', 'pattern-recognition'];
  const found = foundations.map((f) => ability[f]?.value).filter((v) => v != null);
  const base = found.length ? found.reduce((s, v) => s + v, 0) / found.length : 45;

  const learn = Object.keys(importance)
    .map((s) => SUBSKILLS[s]?.learnability ?? 0.7);
  const avgLearn = learn.length ? learn.reduce((s, v) => s + v, 0) / learn.length : 0.7;

  return Math.round(Math.min(100, base * (0.6 + avgLearn * 0.4)));
}

/**
 * Rank candidate roles. Returns 2-3 with explicit evidence.
 * A role must win on interest AND (aptitude OR potential) to be recommended.
 */
export function rankCandidates({ roleProfiles, interests, ability, constraints = {} }) {
  const scored = roleProfiles.map((rp) => {
    const interest = interestFor(rp.role, rp, interests);
    const measured = aptitudeFor(rp, ability);
    const aptitude = measured ?? potentialFor(rp, ability);
    const market = rp.marketDemand ?? 70;

    // Interest weighted highest: a job you hate is not a career.
    const overall = Math.round(interest * 0.45 + aptitude * 0.35 + market * 0.2);

    const evidence = [];
    if (interest >= 65) {
      const axes = (rp.interestAxes || []).map((a) => INTEREST_AXES[a]?.label).filter(Boolean);
      evidence.push(`Your answers pointed strongly towards ${axes.join(' and ').toLowerCase()}.`);
    }
    if (measured != null && measured >= 55) {
      const top = Object.entries(rp.importance || {})
        .sort((a, b) => b[1] - a[1]).slice(0, 2)
        .map(([k]) => subskillLabel(k));
      evidence.push(`You already show usable ability in ${top.join(' and ')}.`);
    } else if (measured == null) {
      evidence.push(`You have not been tested on this area yet — this is based on your reasoning ability and interests, so treat it as a lead, not a verdict.`);
    }
    if (market >= 75) evidence.push(`Hiring demand for this role in India is currently strong.`);
    if (constraints.hoursPerWeek && constraints.hoursPerWeek < 8) {
      evidence.push(`With ${constraints.hoursPerWeek} hrs/week this is a slower path — realistic, but plan for it.`);
    }

    return {
      role: rp.role, label: rp.label,
      interestScore: interest, aptitudeScore: aptitude, marketScore: market,
      overall, evidence,
      dayInTheLife: rp.dayInTheLife,
      measured: measured != null,
      profile: rp,
    };
  });

  return scored.sort((a, b) => b.overall - a.overall).slice(0, 3);
}

/** The 6-week probe: try it small before you commit years. */
export function buildProbe(candidate) {
  const rp = candidate.profile;
  const first = rp.milestoneTemplate?.[0];
  return {
    weeks: 6,
    brief: first
      ? `Spend six weeks on this: ${first.youWillBuild} If that work energises you, this is your direction. If it bores you, you have learned that in six weeks instead of three years.`
      : `Spend six weeks trying the entry-level work of this role. If it energises you, commit. If not, you have lost six weeks, not three years.`,
  };
}

/** Interest axis scores from tradeoff + work-sample responses. */
export function computeInterests(responses) {
  const axes = {};
  for (const r of responses) {
    if (!r.scoreMap) continue;
    const contrib = r.scoreMap[r.chosenKey];
    if (!contrib) continue;
    for (const [k, v] of Object.entries(contrib)) {
      if (!k.startsWith('interest:')) continue;
      const axis = k.slice(9);
      axes[axis] ??= { sum: 0, n: 0 };
      axes[axis].sum += v;
      axes[axis].n += 1;
    }
  }
  const out = {};
  for (const key of Object.keys(INTEREST_AXES)) {
    const a = axes[key];
    // 0-100, default 50 when unprobed
    out[key] = a ? Math.round(Math.max(0, Math.min(100, 50 + (a.sum / a.n) * 50))) : 50;
  }
  return out;
}
