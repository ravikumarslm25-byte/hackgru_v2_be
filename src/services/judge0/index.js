import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

/** Judge0 language ids (CE). */
export const LANGUAGES = {
  c: { id: 50, label: 'C (GCC 9)' },
  cpp: { id: 54, label: 'C++ (GCC 9)' },
  java: { id: 62, label: 'Java (OpenJDK 13)' },
  python: { id: 71, label: 'Python 3.8' },
  javascript: { id: 63, label: 'JavaScript (Node 12)' },
};

export const isJudge0Enabled = () => Boolean(env.judge0.key);

const b64 = (s) => Buffer.from(s ?? '', 'utf8').toString('base64');
const unb64 = (s) => (s ? Buffer.from(s, 'base64').toString('utf8') : '');

/**
 * Run one submission against Judge0 and return a normalized result.
 * Compares trimmed stdout to expectedOutput to decide pass/fail per case.
 */
export async function runOnJudge0({ language, source, stdin = '', expectedOutput = '' }) {
  if (!isJudge0Enabled()) throw new ApiError(503, 'Code execution is not set up yet. Please contact HackGRU.');
  const lang = LANGUAGES[language];
  if (!lang) throw ApiError.badRequest('Unsupported language.');

  const url = `https://${env.judge0.host}/submissions?base64_encoded=true&wait=true&fields=stdout,stderr,compile_output,status,time,memory`;
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-RapidAPI-Key': env.judge0.key,
        'X-RapidAPI-Host': env.judge0.host,
      },
      body: JSON.stringify({
        language_id: lang.id,
        source_code: b64(source),
        stdin: b64(stdin),
        expected_output: expectedOutput ? b64(expectedOutput) : undefined,
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError(502, 'The code runner did not respond. Try again in a moment.');
  }
  if (!resp.ok) throw new ApiError(502, `Code runner error (${resp.status}).`);
  const d = await resp.json();

  const stdout = unb64(d.stdout);
  const stderr = unb64(d.stderr);
  const compileOutput = unb64(d.compile_output);
  const statusId = d.status?.id;
  const statusText = d.status?.description || 'Unknown';
  // 3 = Accepted (when expected_output provided, Judge0 returns 3 only if it matches).
  const norm = (x) => (x || '').replace(/\r\n/g, '\n').replace(/\s+$/gm, '').trim();
  const passed = expectedOutput ? norm(stdout) === norm(expectedOutput) : statusId === 3;

  return {
    passed, statusId, statusText,
    stdout, stderr, compileOutput,
    time: d.time, memory: d.memory,
  };
}
