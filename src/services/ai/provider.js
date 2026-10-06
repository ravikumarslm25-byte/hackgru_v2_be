/**
 * Provider-agnostic AI client.
 *
 * HARD RULES (enforced by architecture, not discipline):
 *  1. Server-side only. The key never goes near the browser.
 *  2. AI NARRATES. It never computes a score or ranks a goal.
 *  3. Student text enters as DATA inside a delimiter, never as instruction.
 *  4. No key → every caller falls back to rules-based output. The app still works.
 */
import { env } from '../../config/env.js';

export const isAiEnabled = () => Boolean(env.aiApiKey);

const MAX_OUTPUT_TOKENS = 1400;

/**
 * Single entry point. Returns { ok, text } — callers must handle ok:false.
 * Never throws: an AI outage must not break an assessment.
 */
export async function complete({ system, messages, maxTokens = MAX_OUTPUT_TOKENS, temperature = 0.4 }) {
  if (!isAiEnabled()) return { ok: false, reason: 'ai-disabled' };

  try {
    const res = await fetch(`${env.aiBaseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.aiApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.aiModel,
        max_tokens: maxTokens,
        temperature,
        system,
        messages,
      }),
      signal: AbortSignal.timeout(env.aiTimeoutMs),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[ai] ${res.status}: ${body.slice(0, 200)}`);
      return { ok: false, reason: `http-${res.status}` };
    }

    const data = await res.json();
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return { ok: true, text, usage: data.usage };
  } catch (err) {
    console.warn('[ai] request failed:', err.message);
    return { ok: false, reason: err.name === 'TimeoutError' ? 'timeout' : 'error' };
  }
}

/**
 * Ask for JSON and validate it. Model output is untrusted input —
 * if it doesn't parse or doesn't match, we fall back rather than store garbage.
 */
export async function completeJson({ system, messages, validate, maxTokens }) {
  const r = await complete({
    system: `${system}\n\nRespond with ONLY valid JSON. No markdown fences, no preamble, no commentary.`,
    messages, maxTokens, temperature: 0.3,
  });
  if (!r.ok) return r;

  try {
    const cleaned = r.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    if (validate && !validate(parsed)) return { ok: false, reason: 'schema-mismatch' };
    return { ok: true, data: parsed, usage: r.usage };
  } catch {
    return { ok: false, reason: 'parse-error' };
  }
}

/** Wrap untrusted student text so it can't be read as instruction. */
export const asData = (label, text) =>
  `<${label}>\n${String(text ?? '').slice(0, 2000)}\n</${label}>`;
