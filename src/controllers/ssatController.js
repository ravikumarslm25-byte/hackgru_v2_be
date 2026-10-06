import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { env } from '../config/env.js';
import { Item } from '../models/ssat/Item.js';
import { Session } from '../models/ssat/Session.js';
import { Result } from '../models/ssat/Result.js';
import { RoleProfile } from '../models/ssat/RoleProfile.js';
import { getBlueprint, BLUEPRINTS, BROAD_SCREEN_SUBSKILLS, focusedSubskills } from '../services/ssat/blueprints.js';
import {
  bankFor, moduleSize, servedIn, progressOf, advanceModule, bumpModuleCount, moduleComplete,
} from '../services/ssat/sessionFlow.js';
import { selectNextItem, selectInventoryItem } from '../services/ssat/adaptive.js';
import { updateAbility } from '../services/ssat/scoring.js';
import { buildReport } from '../services/ssat/reportBuilder.js';
import { nextDiscoveryQuestion, gradeFreeText } from '../services/ai/narrative.js';
import { isAiEnabled } from '../services/ai/provider.js';
import { PROFILER_QUESTIONS, DISCOVERY_QUESTIONS } from '../seed/ssat/profiler.data.js';

const SESSION_TTL_HOURS = 48;

/**
 * Resolve an item's options on the SERVER.
 * p-role's options come from the live RoleProfile collection. Building them on
 * the client meant that if the roles weren't seeded, the question rendered with
 * zero options and the student was hard-locked with nothing to click.
 */
async function resolveOptions(q) {
  if (!q.meta?.dynamicRoles) return q.options || [];
  const roles = await RoleProfile.find({ isActive: true })
    .select('role label summary').sort('label').lean();
  return roles.map((r) => ({
    key: r.role,
    text: r.summary ? `${r.label} — ${r.summary}` : r.label,
  }));
}

/** Strip anything the client must never see. */
const publicItem = (item, meta = {}) => ({
  id: item._id,
  dimension: item.dimension,
  type: item.type,
  stem: item.stem,
  code: item.code || '',
  options: (item.options || []).map((o) => ({ key: o.key, text: o.text })),
  timeLimitSec: item.timeLimitSec,
  ...meta,
});

// @route GET /api/ssat/config
export const getConfig = asyncHandler(async (_req, res) => {
  const roles = await RoleProfile.find({ isActive: true })
    .select('role label family summary dayInTheLife marketDemand entrySalaryBand typicalTitles')
    .sort('label').lean();
  ok(res, {
    blueprints: Object.values(BLUEPRINTS).map((b) => ({
      key: b.key, label: b.label, totalMinutes: b.totalMinutes,
      modules: b.modules.map((m) => ({ key: m.key, label: m.label, minutes: m.minutes })),
    })),
    roles,
    aiEnabled: isAiEnabled(),
    profilerQuestions: PROFILER_QUESTIONS,
  });
});

// @route GET /api/ssat/session — resume in progress
export const getActiveSession = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ student: req.user._id, state: 'in-progress' })
    .sort('-lastActiveAt').lean();
  if (!session) return ok(res, { session: null });
  if (session.expiresAt && session.expiresAt < new Date()) {
    await Session.updateOne({ _id: session._id }, { state: 'expired' });
    return ok(res, { session: null });
  }
  ok(res, {
    session: {
      id: session._id, path: session.path, currentModule: session.currentModule,
      modules: session.modules, progress: progressOf(session),
      startedAt: session.startedAt,
    },
  });
});

// @route POST /api/ssat/session  { path }
export const startSession = asyncHandler(async (req, res) => {
  const { path } = req.body;
  if (!['clear', 'discovery'].includes(path)) throw ApiError.badRequest("path must be 'clear' or 'discovery'");

  await Session.updateMany({ student: req.user._id, state: 'in-progress' }, { state: 'abandoned' });

  const blueprintKey = path === 'clear' ? 'clear-v1' : 'discovery-v1';
  const bp = getBlueprint(blueprintKey);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);

  const session = await Session.create({
    student: req.user._id, path, blueprintKey,
    modules: bp.modules.map((m) => m.key),
    currentModule: bp.modules[0].key,
    expiresAt,
  });

  ok(res, {
    session: {
      id: session._id, path, modules: session.modules, currentModule: session.currentModule,
      totalMinutes: bp.totalMinutes, progress: progressOf(session),
    },
  }, 'Assessment started', 201);
});

// @route DELETE /api/ssat/session/:id — abandon and start fresh
export const abandonSession = asyncHandler(async (req, res) => {
  await Session.updateOne(
    { _id: req.params.id, student: req.user._id, state: 'in-progress' },
    { state: 'abandoned' }
  );
  ok(res, {}, 'Session abandoned');
});

// @route GET /api/ssat/session/:id/next
export const getNextItem = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ _id: req.params.id, student: req.user._id });
  if (!session) throw ApiError.notFound('Session not found');
  if (session.state !== 'in-progress') throw ApiError.badRequest('This session is already finished');
  if (session.expiresAt < new Date()) {
    session.state = 'expired'; await session.save();
    throw ApiError.badRequest('This session expired. Please start a new one.');
  }

  const bp = getBlueprint(session.blueprintKey);

  // Walk modules until we find something to serve
  for (let guard = 0; guard < bp.modules.length + 1; guard++) {
    const mod = bp.modules.find((m) => m.key === session.currentModule);
    if (!mod) break;

    const servedInModule = servedIn(session, mod.key);
    if (moduleComplete(session, mod)) { advanceModule(session, bp); continue; }

    // --- profiler / discovery: static questions, no DB items ---
    // NOTE: the counter is bumped in submitAnswer, not here, so that a refresh
    // re-serves the same unanswered question instead of skipping it.
    const staticBank = bankFor(session, mod);
    if (staticBank) {
      const q = staticBank[servedInModule];
      if (!q) { advanceModule(session, bp); continue; }

      const options = await resolveOptions(q);

      // A choice question with no choices is a dead end — the student cannot
      // answer it and cannot move past it. Skip it loudly rather than serve it.
      if (q.type !== 'free-text' && options.length === 0) {
        console.error(
          `[ssat] SKIPPING "${q.id}" — it resolved to zero options.` +
          (q.meta?.dynamicRoles ? ' No RoleProfiles found: run `npm run seed:ssat`.' : '')
        );
        bumpModuleCount(session, mod.key);
        await session.save();
        continue;
      }

      session.lastActiveAt = new Date();
      await session.save();
      return ok(res, {
        item: { id: q.id, type: q.type, stem: q.stem, options, kind: mod.kind, meta: q.meta || {} },
        module: { key: mod.key, label: mod.label, index: servedInModule + 1, total: moduleSize(session, mod) },
        progress: progressOf(session),
      });
    }

    // --- ability / inventory: adaptive from the bank ---
    let item;
    if (mod.kind === 'inventory') {
      const dim = mod.dimensions[servedInModule % mod.dimensions.length];
      item = await selectInventoryItem({ session, dimension: dim });
    } else {
      let pool = BROAD_SCREEN_SUBSKILLS;
      if (!mod.broad && session.profile?.role) {
        const rp = await RoleProfile.findOne({ role: session.profile.role }).lean();
        pool = focusedSubskills(rp);
      }
      if (mod.dimension === 'logical') pool = ['numerical-reasoning', 'logical-reasoning', 'pattern-recognition', 'data-interpretation'];
      if (mod.dimension === 'verbal') pool = ['reading-comprehension', 'grammar-usage', 'written-expression'];

      item = await selectNextItem({
        session, dimension: mod.dimension, subskillPool: pool, measures: mod.measures,
      });
    }

    if (!item) { advanceModule(session, bp); continue; }

    session.servedItemIds.push(item._id);
    bumpModuleCount(session, mod.key);
    session.lastActiveAt = new Date();
    await session.save();

    return ok(res, {
      item: publicItem(item),
      module: { key: mod.key, label: mod.label, index: servedInModule + 1, total: moduleSize(session, mod) },
      progress: progressOf(session),
    });
  }

  // Nothing left → done
  ok(res, { item: null, done: true, progress: progressOf(session) });
});

// @route POST /api/ssat/session/:id/answer  { itemId, chosenKey, text, timeTakenMs }
export const submitAnswer = asyncHandler(async (req, res) => {
  const { itemId, chosenKey, text, timeTakenMs } = req.body;
  const session = await Session.findOne({ _id: req.params.id, student: req.user._id });
  if (!session) throw ApiError.notFound('Session not found');
  if (session.state !== 'in-progress') throw ApiError.badRequest('This session is already finished');

  const bp = getBlueprint(session.blueprintKey);
  const mod = bp.modules.find((m) => m.key === session.currentModule);

  // --- profiler / discovery answers go to the profile, not the score ---
  const staticBank = bankFor(session, mod);
  if (staticBank) {
    const q = staticBank.find((x) => x.id === itemId);
    if (!q) throw ApiError.badRequest('Unknown question');

    // Idempotency: if this question was already answered, don't double-advance.
    const expected = staticBank[servedIn(session, mod.key)];
    if (!expected || expected.id !== q.id) {
      console.warn(`[ssat] stale answer for "${q.id}" (expecting "${expected?.id ?? 'end-of-module'}") — ignored`);
      return ok(res, { recorded: true, stale: true, progress: progressOf(session) });
    }

    // Reject an answer that isn't one of the offered options, otherwise the
    // profile silently fills with junk the report engine can't use.
    if (q.type !== 'free-text') {
      const options = await resolveOptions(q);
      if (!options.some((o) => o.key === chosenKey)) {
        throw ApiError.badRequest(`"${chosenKey}" is not a valid option for this question`);
      }
    }

    if (mod.kind === 'profiler') {
      session.profile = { ...session.profile, [q.field]: chosenKey ?? text };
      session.markModified('profile');
    } else {
      // discovery tradeoffs/work-samples feed the interest engine
      session.responses.push({
        item: undefined, dimension: 'discovery', subskills: [],
        chosenKey, text, correct: null, timeTakenMs, answeredAt: new Date(),
      });
      session.profile = {
        ...session.profile,
        discovery: { ...(session.profile?.discovery || {}), [q.id]: chosenKey ?? text },
      };
      session.markModified('profile');
      session.markModified('responses');
    }

    // Advance the cursor. Without this the next `next` call re-serves the same
    // question forever — the bug that froze the profiler on question 1.
    bumpModuleCount(session, mod.key);
    session.lastActiveAt = new Date();
    await session.save();
    return ok(res, { recorded: true, progress: progressOf(session) });
  }

  // --- ability / inventory: score SERVER-SIDE ---
  const item = await Item.findById(itemId).select('+correctKey +scoreMap +rubric');
  if (!item) throw ApiError.notFound('Item not found');
  if (!session.servedItemIds.some((id) => String(id) === String(itemId))) {
    throw ApiError.badRequest('That item was not served in this session');
  }
  if (session.responses.some((r) => String(r.item) === String(itemId))) {
    throw ApiError.conflict('Already answered');
  }

  let correct = null;
  if (item.correctKey) {
    correct = chosenKey === item.correctKey;
  } else if (item.type === 'free-text' && item.rubric) {
    const graded = await gradeFreeText({ stem: item.stem, rubric: item.rubric, answer: text });
    correct = graded.ok ? graded.score >= 60 : null;
  }

  session.responses.push({
    item: item._id, dimension: item.dimension, subskills: item.subskills || [],
    chosenKey, text, correct, difficulty: item.difficulty,
    timeTakenMs, answeredAt: new Date(),
  });

  // Update running ability for each subskill this item loads on
  if (correct !== null) {
    const ability = { ...(session.ability || {}) };
    for (const s of item.subskills || []) {
      ability[s] = updateAbility(ability[s], { correct, difficulty: item.difficulty });
    }
    session.ability = ability;
    session.markModified('ability');
  }

  session.lastActiveAt = new Date();
  session.timeSpentMs += timeTakenMs || 0;
  session.markModified('responses');
  await session.save();

  // Calibration data for future IRT migration
  Item.updateOne({ _id: item._id }, {
    $inc: { 'stats.timesServed': 1, 'stats.timesCorrect': correct ? 1 : 0 },
  }).catch(() => {});

  // Never leak whether they were right — that's report-time information
  ok(res, { recorded: true, progress: progressOf(session) });
});

// @route POST /api/ssat/session/:id/dialogue  { text }
export const discoveryDialogue = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ _id: req.params.id, student: req.user._id });
  if (!session) throw ApiError.notFound('Session not found');
  if (session.path !== 'discovery') throw ApiError.badRequest('Dialogue is only part of the discovery path');

  const { text } = req.body;
  if (text) {
    session.dialogue.push({ role: 'student', text: String(text).slice(0, 1000) });
    session.dialogueTurns += 1;
  }

  if (session.dialogueTurns >= env.aiMaxTurnsPerSession) {
    await session.save();
    return ok(res, { question: null, done: true });
  }

  const r = await nextDiscoveryQuestion({
    profile: session.profile, interests: session.profile?.discovery || {},
    dialogue: session.dialogue, turn: session.dialogueTurns + 1,
  });

  if (!r.ok) { await session.save(); return ok(res, { question: null, done: true, aiUnavailable: true }); }

  session.dialogue.push({ role: 'assistant', text: r.question });
  await session.save();
  ok(res, { question: r.question, turn: session.dialogueTurns, maxTurns: env.aiMaxTurnsPerSession });
});

// @route POST /api/ssat/session/:id/submit
export const submitSession = asyncHandler(async (req, res) => {
  const session = await Session.findOne({ _id: req.params.id, student: req.user._id });
  if (!session) throw ApiError.notFound('Session not found');
  if (session.state === 'completed' && session.result) {
    const existing = await Result.findById(session.result).lean();
    return ok(res, { result: existing }, 'Already submitted');
  }
  if (!session.responses.length) throw ApiError.badRequest('No answers recorded yet');

  const result = await buildReport({ session, student: req.user });

  session.state = 'completed';
  session.completedAt = new Date();
  session.result = result._id;
  await session.save();

  ok(res, { result }, 'Assessment complete', 201);
});

// @route GET /api/ssat/results/me
export const getMyResults = asyncHandler(async (req, res) => {
  const results = await Result.find({ student: req.user._id }).sort('-takenAt').limit(10).lean();
  ok(res, { results });
});

// @route GET /api/ssat/results/:id
export const getResult = asyncHandler(async (req, res) => {
  const result = await Result.findOne({ _id: req.params.id, student: req.user._id }).lean();
  if (!result) throw ApiError.notFound('Result not found');
  ok(res, { result });
});
