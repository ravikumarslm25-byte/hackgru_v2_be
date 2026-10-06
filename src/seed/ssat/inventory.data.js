/**
 * Work-style and EQ inventory items.
 *
 * ⚠️ ETHICAL BOUNDARY — read before editing:
 * These are NOT psychometric instruments and must never be presented as one.
 * They are structured self-reflection. There are no right answers, no scores
 * shown to the student, and no diagnosis. Output is a narrative profile for
 * the student's own awareness and their mentor's coaching.
 *
 * Ideally reviewed by someone with psychology training before production.
 * Never share these outputs with hiring partners without separate, explicit,
 * informed consent.
 *
 * scoreMap maps an option → trait poles (-1..1) or EQ facets (eq: prefix).
 */

const P = (o) => ({ dimension: 'psychological', type: 'likert', status: 'live', difficulty: 3, ...o });
const E = (o) => ({ dimension: 'emotional', type: 'sjt', status: 'live', difficulty: 3, ...o });

export const inventoryData = [
  // ================= WORK STYLE =================
  P({ trait: 'structure',
    stem: 'You are given a big project with three months and no instructions. How do you feel?',
    options: [
      { key: 'a', text: 'Great — I will figure out my own way' },
      { key: 'b', text: 'Okay, but I would like a rough outline' },
      { key: 'c', text: 'Uncomfortable — I want to know what is expected' },
      { key: 'd', text: 'Stressed — I need a clear plan to start' },
    ],
    scoreMap: { a: { structure: 1 }, b: { structure: 0.4 }, c: { structure: -0.4 }, d: { structure: -1 } } }),
  P({ trait: 'depth',
    stem: 'Given a free weekend to learn, you would rather:',
    options: [
      { key: 'a', text: 'Go deep on one topic until it clicks completely' },
      { key: 'b', text: 'Mostly one topic, with a couple of detours' },
      { key: 'c', text: 'Sample several things that caught my eye' },
      { key: 'd', text: 'Jump between whatever seems interesting' },
    ],
    scoreMap: { a: { depth: -1 }, b: { depth: -0.4 }, c: { depth: 0.4 }, d: { depth: 1 } } }),
  P({ trait: 'pace',
    stem: 'You are building something. Which is more like you?',
    options: [
      { key: 'a', text: 'Get a rough version working fast, then improve it' },
      { key: 'b', text: 'Mostly fast, but I clean up as I go' },
      { key: 'c', text: 'Steady — I would rather do it right the first time' },
      { key: 'd', text: 'Careful and thorough, even if it takes longer' },
    ],
    scoreMap: { a: { pace: 1 }, b: { pace: 0.4 }, c: { pace: -0.4 }, d: { pace: -1 } } }),
  P({ trait: 'collaboration',
    stem: 'You do your best work:',
    options: [
      { key: 'a', text: 'Alone, with no interruptions' },
      { key: 'b', text: 'Mostly alone, checking in occasionally' },
      { key: 'c', text: 'With a partner to think out loud with' },
      { key: 'd', text: 'In a group, feeding off other people\'s energy' },
    ],
    scoreMap: { a: { collaboration: -1 }, b: { collaboration: -0.4 }, c: { collaboration: 0.4 }, d: { collaboration: 1 } } }),
  P({ trait: 'feedback',
    stem: 'Someone points out a flaw in your work in front of others. Your first instinct:',
    options: [
      { key: 'a', text: 'Discuss it right there — I want to understand' },
      { key: 'b', text: 'Ask one question, think about it later' },
      { key: 'c', text: 'Take it in quietly, process it alone afterwards' },
      { key: 'd', text: 'Feel stung first, come back to it when calmer' },
    ],
    scoreMap: { a: { feedback: 1, 'eq:regulation': 0.5 }, b: { feedback: 0.3 }, c: { feedback: -0.5 }, d: { feedback: -1, 'eq:self-awareness': 0.4 } } }),
  P({ trait: 'persistence',
    stem: 'You have been stuck on the same bug for two hours. What do you actually do?',
    options: [
      { key: 'a', text: 'Keep going — I will crack it eventually' },
      { key: 'b', text: 'Take a break, come back, then ask if still stuck' },
      { key: 'c', text: 'Search harder, then ask after another hour' },
      { key: 'd', text: 'Ask someone now — two hours is already too long' },
    ],
    scoreMap: { a: { persistence: -1 }, b: { persistence: 0.2, 'eq:self-awareness': 0.4 }, c: { persistence: -0.3 }, d: { persistence: 1, 'eq:collaboration': 0.4 } } }),

  // ================= EQ / SJT =================
  E({ facet: 'regulation',
    stem: 'It is the night before your demo. You discover a bug that breaks the main feature. What do you actually do?',
    options: [
      { key: 'a', text: 'Panic, then work through the night on adrenaline' },
      { key: 'b', text: 'Assess how bad it is, decide whether to fix or work around it, tell whoever needs to know' },
      { key: 'c', text: 'Hope nobody clicks that button during the demo' },
      { key: 'd', text: 'Message the team immediately and ask for help' },
    ],
    scoreMap: {
      a: { 'eq:regulation': -0.5 },
      b: { 'eq:regulation': 1, 'eq:self-awareness': 0.5 },
      c: { 'eq:regulation': -0.8 },
      d: { 'eq:regulation': 0.3, 'eq:collaboration': 0.8 },
    } }),
  E({ facet: 'empathy',
    stem: 'A teammate has been quiet and their work has slipped for two weeks. You:',
    options: [
      { key: 'a', text: 'Say nothing — not my business' },
      { key: 'b', text: 'Report it to the lead' },
      { key: 'c', text: 'Ask them privately if they are okay' },
      { key: 'd', text: 'Quietly cover their work so nobody notices' },
    ],
    scoreMap: {
      a: { 'eq:empathy': -0.6 },
      b: { 'eq:empathy': -0.2, 'eq:collaboration': 0.2 },
      c: { 'eq:empathy': 1, 'eq:collaboration': 0.5 },
      d: { 'eq:empathy': 0.4, 'eq:collaboration': -0.2 },
    } }),
  E({ facet: 'growth-mindset',
    stem: 'You fail a technical interview badly. A week later, you:',
    options: [
      { key: 'a', text: 'Have written down every question I could not answer and started learning them' },
      { key: 'b', text: 'Am still avoiding thinking about it' },
      { key: 'c', text: 'Have decided that company was not a good fit anyway' },
      { key: 'd', text: 'Am wondering whether I am cut out for this at all' },
    ],
    scoreMap: {
      a: { 'eq:growth-mindset': 1, 'eq:self-awareness': 0.5 },
      b: { 'eq:growth-mindset': -0.6 },
      c: { 'eq:growth-mindset': -0.4, 'eq:self-awareness': -0.3 },
      d: { 'eq:growth-mindset': -0.5, 'eq:self-awareness': 0.3 },
    } }),
  E({ facet: 'collaboration',
    stem: 'In a group project, one person is doing almost nothing. The deadline is in three days. You:',
    options: [
      { key: 'a', text: 'Do their part yourself — faster than arguing' },
      { key: 'b', text: 'Talk to them directly about what is going on' },
      { key: 'c', text: 'Complain to the rest of the group' },
      { key: 'd', text: 'Go straight to the professor or lead' },
    ],
    scoreMap: {
      a: { 'eq:collaboration': -0.3, 'eq:regulation': 0.2 },
      b: { 'eq:collaboration': 1, 'eq:empathy': 0.5 },
      c: { 'eq:collaboration': -0.6 },
      d: { 'eq:collaboration': -0.2 },
    } }),
  E({ facet: 'self-awareness',
    stem: 'Which is closest to true about you, honestly?',
    options: [
      { key: 'a', text: 'I know exactly what I am bad at and it does not bother me to say so' },
      { key: 'b', text: 'I know roughly, but I would rather not advertise it' },
      { key: 'c', text: 'I find out what I am bad at when something goes wrong' },
      { key: 'd', text: 'I tend to assume I am worse than I actually am' },
    ],
    scoreMap: {
      a: { 'eq:self-awareness': 1 },
      b: { 'eq:self-awareness': 0.3 },
      c: { 'eq:self-awareness': -0.5 },
      d: { 'eq:self-awareness': 0.2, 'eq:growth-mindset': -0.2 },
    } }),
  E({ facet: 'regulation',
    stem: 'Your code review comes back with 15 comments. Your honest first reaction:',
    options: [
      { key: 'a', text: 'Useful — that is 15 things I now know' },
      { key: 'b', text: 'A bit deflated, but I get to work' },
      { key: 'c', text: 'Annoyed — most of these are nitpicks' },
      { key: 'd', text: 'Embarrassed that I missed so much' },
    ],
    scoreMap: {
      a: { 'eq:regulation': 1, 'eq:growth-mindset': 0.8 },
      b: { 'eq:regulation': 0.5, 'eq:growth-mindset': 0.4 },
      c: { 'eq:regulation': -0.5 },
      d: { 'eq:regulation': -0.2, 'eq:self-awareness': 0.3 },
    } }),
];
