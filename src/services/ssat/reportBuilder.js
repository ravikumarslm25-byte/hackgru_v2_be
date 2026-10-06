/**
 * Assembles the final report. Orchestration only — the thinking lives in
 * scoring.js (numbers), goalEngine.js (direction) and journeyEngine.js (plan).
 */
import { Item } from '../../models/ssat/Item.js';
import { Result } from '../../models/ssat/Result.js';
import { RoleProfile } from '../../models/ssat/RoleProfile.js';
import { Course } from '../../models/Course.js';
import { rollUpDimensions, scoreInventory, bandFor, confidenceLabel, BAND_MEANING } from './scoring.js';
import { computeInterests, rankCandidates, buildProbe } from './goalEngine.js';
import {
  analyseGaps, extractStrengths, extractWeaknesses,
  buildJourney, assessReadiness, buildFirstWeek, buildCheckpoints,
} from './journeyEngine.js';
import { buildNarrative } from '../ai/narrative.js';
import { WORKSTYLE_TRAITS, EQ_FACETS } from './taxonomy.js';

/** Attach scoreMaps (select:false) to inventory responses for scoring. */
async function hydrateScoreMaps(responses) {
  const ids = responses.map((r) => r.item).filter(Boolean);
  const items = await Item.find({ _id: { $in: ids } }).select('+scoreMap').lean();
  const map = Object.fromEntries(items.map((i) => [String(i._id), i.scoreMap]));
  return responses.map((r) => ({ ...r, scoreMap: map[String(r.item)] }));
}

function narrateWorkStyle(traits) {
  const out = {};
  for (const [key, meta] of Object.entries(WORKSTYLE_TRAITS)) {
    const v = traits[key];
    if (v == null) continue;
    const leaning = v < -0.25 ? 0 : v > 0.25 ? 1 : null;
    out[key] = {
      label: meta.label,
      value: v,
      leaning: leaning === null ? 'balanced' : meta.poles[leaning],
      note: leaning === null
        ? 'You sit in the middle here — you can flex either way, which is genuinely useful.'
        : `You lean towards: ${meta.poles[leaning].toLowerCase()}.`,
    };
  }
  return out;
}

function narrateEq(facets) {
  const out = {};
  for (const [key, meta] of Object.entries(EQ_FACETS)) {
    const v = facets[key];
    if (v == null) continue;
    out[key] = {
      label: meta.label,
      value: v,
      note: v >= 0.4
        ? 'You reported handling this well. Worth leaning on.'
        : v <= -0.2
          ? 'You reported finding this harder. Not a flaw — something to be aware of, and a good thing to raise with your mentor.'
          : 'Mixed — depends on the situation, which is true for most people.',
    };
  }
  return out;
}

export async function buildReport({ session, student }) {
  // 1) Numbers — deterministic
  const hydrated = await hydrateScoreMaps(session.responses);
  const ability = session.ability || {};
  const dimensions = rollUpDimensions(ability);
  const { traits, facets } = scoreInventory(hydrated);
  const interests = computeInterests(hydrated);

  // 2) Target role
  const profile = session.profile || {};
  const hoursPerWeek = Number(profile.hoursPerWeek) || 8;
  const timelineWeeks = Number(profile.timelineWeeks) || 12;

  let roleProfile = null;
  let candidates = [];
  let goalStatus = 'unclear';

  if (session.path === 'clear' && profile.role) {
    roleProfile = await RoleProfile.findOne({ role: profile.role, isActive: true }).lean();
    goalStatus = 'stated';
  }

  if (!roleProfile) {
    // Discovery path — or a stated role we don't have a profile for
    const all = await RoleProfile.find({ isActive: true }).lean();
    const ranked = rankCandidates({ roleProfiles: all, interests, ability, constraints: { hoursPerWeek } });
    candidates = ranked.map((c) => ({
      role: c.role, label: c.label,
      interestScore: c.interestScore, aptitudeScore: c.aptitudeScore, marketScore: c.marketScore,
      overall: c.overall, evidence: c.evidence, dayInTheLife: c.dayInTheLife,
      probe: buildProbe(c),
    }));
    roleProfile = ranked[0]?.profile || null;
    goalStatus = candidates.length ? 'discovered' : 'unclear';
  }

  // 3) Gaps, journey, honesty check
  const courses = await Course.find({ isPublished: true }).select('slug title price ssatSubskills tags').lean();
  let gapRows = [], journey = [], readiness = {}, strengths = [], weaknesses = [], firstWeek = [], checkpoints = [];

  if (roleProfile) {
    gapRows = analyseGaps({ ability, roleProfile });
    strengths = extractStrengths(gapRows);
    weaknesses = extractWeaknesses(gapRows);
    journey = buildJourney({ gapRows, roleProfile, courses, hoursPerWeek });
    readiness = assessReadiness({ gapRows, journey, roleProfile, timelineWeeks, hoursPerWeek });
    firstWeek = buildFirstWeek(journey, gapRows);
    checkpoints = buildCheckpoints(journey);
  }

  // 4) Per-subskill detail with confidence
  const subskills = {};
  for (const r of gapRows) {
    subskills[r.subskill] = {
      label: r.label, value: Math.round(r.current), measured: r.measured,
      confidence: r.confidence, confidenceLabel: confidenceLabel(r.confidence),
      band: r.band, meaning: BAND_MEANING[r.band],
      target: r.target, gap: Math.round(r.gap), hours: r.hours,
    };
  }

  // 5) Draft result (narrative added next)
  const draft = {
    student: student._id, session: session._id, path: session.path,
    subskills, dimensions,
    strengths, weaknesses,
    workStyle: narrateWorkStyle(traits),
    eqProfile: narrateEq(facets),
    interests,
    goal: {
      status: goalStatus,
      role: roleProfile?.role,
      label: roleProfile?.label,
      timelineWeeks, hoursPerWeek,
    },
    candidates,
    readiness,
    journey,
    firstWeek,
    checkpoints,
    itemReview: await buildItemReview(session),
    engineVersion: '1.0',
  };

  // 6) Narrative — AI if available, rules otherwise. Never blocks.
  draft.narrative = await buildNarrative({ student, result: draft, roleProfile });

  const result = await Result.create(draft);
  return result;
}

/** The test should teach. Explanations released only after submission. */
async function buildItemReview(session) {
  const ids = session.responses.filter((r) => r.correct !== null).map((r) => r.item);
  if (!ids.length) return [];
  const items = await Item.find({ _id: { $in: ids } }).select('+correctKey +explanation').lean();
  const byId = Object.fromEntries(items.map((i) => [String(i._id), i]));

  return session.responses
    .filter((r) => r.correct !== null)
    .map((r) => {
      const item = byId[String(r.item)];
      if (!item) return null;
      const chosen = item.options?.find((o) => o.key === r.chosenKey);
      return {
        stem: item.stem,
        yourAnswer: chosen?.text || r.text || '—',
        correct: r.correct,
        explanation: item.explanation || '',
      };
    })
    .filter(Boolean)
    .slice(0, 40);
}
