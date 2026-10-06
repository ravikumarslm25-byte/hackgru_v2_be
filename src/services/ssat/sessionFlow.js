/**
 * Session flow — which question comes next, and how far through are we.
 *
 * Deliberately PURE (no DB, no express) so it can be unit-tested. The stuck-on-
 * question-1 bug lived here when this logic was inline in the controller and
 * only the ability branch advanced its counter. Keep it pure.
 */
import { getBlueprint } from './blueprints.js';
import { PROFILER_QUESTIONS, DISCOVERY_QUESTIONS } from '../../seed/ssat/profiler.data.js';

/**
 * Profiler questions for this session's path.
 * Path B students have no role yet — asking them to pick one is nonsense,
 * so p-role is dropped and the module is simply shorter.
 */
export function profilerBankFor(session) {
  return session.path === 'discovery'
    ? PROFILER_QUESTIONS.filter((q) => q.id !== 'p-role')
    : PROFILER_QUESTIONS;
}

/** The static question bank backing a module, or null for DB-driven modules. */
export function bankFor(session, mod) {
  if (!mod) return null;
  if (mod.kind === 'profiler') return profilerBankFor(session);
  if (mod.kind === 'discovery') return DISCOVERY_QUESTIONS;
  return null;
}

/**
 * How many items this module will actually serve.
 * Static modules are sized by their bank (which varies by path), not by the
 * blueprint's nominal count — otherwise progress drifts.
 */
export function moduleSize(session, mod) {
  const bank = bankFor(session, mod);
  return bank ? bank.length : mod.items;
}

/** How many items have been served+answered in a module. */
export const servedIn = (session, modKey) => session.moduleItemCount?.[modKey] || 0;

/** Total items across the whole blueprint for this session's path. */
export function totalItems(session) {
  const bp = getBlueprint(session.blueprintKey);
  if (!bp) return 0;
  return bp.modules.reduce((s, m) => s + moduleSize(session, m), 0);
}

/**
 * Progress. Counts moduleItemCount, NOT responses — profiler answers are stored
 * on session.profile and never create a response, so counting responses reports
 * 0% through the whole first module.
 */
export function progressOf(session) {
  const total = totalItems(session);
  const done = Object.values(session.moduleItemCount || {}).reduce((s, n) => s + n, 0);
  return {
    served: done,
    total,
    percent: total ? Math.min(100, Math.round((done / total) * 100)) : 0,
  };
}

/** Advance the cursor to the next module. Returns it, or null when finished. */
export function advanceModule(session, bp) {
  const idx = bp.modules.findIndex((m) => m.key === session.currentModule);
  const next = bp.modules[idx + 1] || null;
  session.currentModule = next ? next.key : null;
  return next;
}

/**
 * Record that one item in a module has been consumed.
 * THIS IS THE STEP WHOSE ABSENCE FROZE THE PROFILER — every branch that serves
 * or accepts an item must call it exactly once.
 */
export function bumpModuleCount(session, modKey) {
  const next = servedIn(session, modKey) + 1;
  session.moduleItemCount = { ...(session.moduleItemCount || {}), [modKey]: next };
  if (typeof session.markModified === 'function') session.markModified('moduleItemCount');
  return next;
}

/** Is this module finished? */
export const moduleComplete = (session, mod) => servedIn(session, mod.key) >= moduleSize(session, mod);
