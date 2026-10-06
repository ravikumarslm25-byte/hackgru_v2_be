/**
 * ⚠️  STARTER ITEM BANK — REQUIRES MENTOR REVIEW BEFORE PRODUCTION ⚠️
 *
 * Adaptive testing needs roughly 3x the items it serves, spread across
 * difficulty. Target is ~700 items. This file is a working STARTER SET —
 * enough to run and test the full engine end to end, not enough for
 * production-quality measurement.
 *
 * ACTION REQUIRED:
 *  1. Every technical item reviewed by a mentor who does the job.
 *  2. SJT/psychological items ideally reviewed by someone with psych training.
 *  3. Expand toward ~700. Use the admin authoring API, or extend this file.
 *
 * Unreviewed items produce confidently wrong results — worse than no test.
 *
 * FIELDS: difficulty 1-5 · measures 'knowledge'|'potential'
 * 'potential' items are answerable with reasoning alone and are used to screen
 * students who have never studied the topic (the discovery path).
 */

const t = (o) => ({ dimension: 'technical', type: 'mcq', measures: 'knowledge', status: 'live', ...o });
const L = (o) => ({ dimension: 'logical', type: 'mcq', measures: 'potential', status: 'live', ...o });
const V = (o) => ({ dimension: 'verbal', type: 'mcq', measures: 'knowledge', status: 'live', ...o });

export const itemsData = [
  // ============ PROGRAMMING FUNDAMENTALS (potential-friendly) ============
  t({ subskills: ['programming-fundamentals'], difficulty: 1, measures: 'potential',
    stem: 'A loop runs from 1 to 5 and adds each number to a total that starts at 0. What is the total at the end?',
    options: [{key:'a',text:'5'},{key:'b',text:'15'},{key:'c',text:'10'},{key:'d',text:'25'}],
    correctKey: 'b', explanation: '1+2+3+4+5 = 15. This tests whether you can trace a loop mentally — the core skill all programming builds on.' }),
  t({ subskills: ['programming-fundamentals'], difficulty: 2, measures: 'potential',
    stem: 'You have two boxes, A holds "apple" and B holds "banana". You want to swap them. What is the minimum number of extra boxes you need?',
    options: [{key:'a',text:'0'},{key:'b',text:'1'},{key:'c',text:'2'},{key:'d',text:'Impossible'}],
    correctKey: 'b', explanation: 'One temporary box: move A to temp, B to A, temp to B. This is the classic swap — it tests whether you can plan a sequence of steps.' }),
  t({ subskills: ['programming-fundamentals'], difficulty: 3,
    stem: 'What does this print?', code: 'let x = 5;\nlet y = x;\ny = 10;\nconsole.log(x);',
    options: [{key:'a',text:'5'},{key:'b',text:'10'},{key:'c',text:'undefined'},{key:'d',text:'Error'}],
    correctKey: 'a', explanation: 'Numbers are copied by value, so changing y does not touch x. This trips people up when they later meet objects, which behave differently.' }),
  t({ subskills: ['programming-fundamentals','javascript'], difficulty: 3,
    stem: 'What does this print?', code: 'const arr = [1, 2, 3];\nconst copy = arr;\ncopy.push(4);\nconsole.log(arr.length);',
    options: [{key:'a',text:'3'},{key:'b',text:'4'},{key:'c',text:'Error'},{key:'d',text:'undefined'}],
    correctKey: 'b', explanation: 'Arrays are reference types — copy and arr point at the same array. This is one of the most common sources of real bugs.' }),
  t({ subskills: ['programming-fundamentals'], difficulty: 4,
    stem: 'A function calls itself with n-1 until n reaches 0. If it starts at 5 and prints n each time, how many lines print?',
    options: [{key:'a',text:'4'},{key:'b',text:'5'},{key:'c',text:'6'},{key:'d',text:'Infinite'}],
    correctKey: 'b', explanation: 'It prints for 5,4,3,2,1 then stops at 0 — five lines. Recursion questions test whether you can hold a call stack in your head.' }),

  // ============ JAVASCRIPT ============
  t({ subskills: ['javascript'], difficulty: 2,
    stem: 'What is the result of: typeof []',
    options: [{key:'a',text:"'array'"},{key:'b',text:"'object'"},{key:'c',text:"'list'"},{key:'d',text:'undefined'}],
    correctKey: 'b', explanation: "Arrays are objects in JavaScript. Use Array.isArray() to check properly — typeof won't help you." }),
  t({ subskills: ['javascript'], difficulty: 3,
    stem: 'What does this print?', code: "console.log(0.1 + 0.2 === 0.3);",
    options: [{key:'a',text:'true'},{key:'b',text:'false'},{key:'c',text:'Error'},{key:'d',text:'undefined'}],
    correctKey: 'b', explanation: 'Floating-point arithmetic: 0.1+0.2 is 0.30000000000000004. Not a JS quirk — it is how binary floats work everywhere. Compare with a tolerance.' }),
  t({ subskills: ['javascript'], difficulty: 3,
    stem: 'What is logged?', code: "const nums = [1,2,3];\nconst doubled = nums.map(n => n * 2);\nconsole.log(nums);",
    options: [{key:'a',text:'[2,4,6]'},{key:'b',text:'[1,2,3]'},{key:'c',text:'undefined'},{key:'d',text:'[1,2,3,2,4,6]'}],
    correctKey: 'b', explanation: 'map returns a NEW array and never mutates the original. Knowing which methods mutate is essential in React.' }),
  t({ subskills: ['javascript'], difficulty: 4,
    stem: 'What order do these print?', code: "console.log('A');\nsetTimeout(() => console.log('B'), 0);\nPromise.resolve().then(() => console.log('C'));\nconsole.log('D');",
    options: [{key:'a',text:'A D C B'},{key:'b',text:'A B C D'},{key:'c',text:'A D B C'},{key:'d',text:'A C D B'}],
    correctKey: 'a', explanation: 'Sync code first (A, D), then microtasks/promises (C), then macrotasks/timers (B). The event loop is a top interview question.' }),
  t({ subskills: ['javascript'], difficulty: 5,
    stem: 'What does this print?', code: "for (var i = 0; i < 3; i++) {\n  setTimeout(() => console.log(i), 0);\n}",
    options: [{key:'a',text:'0 1 2'},{key:'b',text:'3 3 3'},{key:'c',text:'0 0 0'},{key:'d',text:'undefined ×3'}],
    correctKey: 'b', explanation: 'var is function-scoped, so all three callbacks close over the same i, which is 3 by the time they run. Change var to let and you get 0 1 2. Classic closure question.' }),

  // ============ HTML / CSS ============
  t({ subskills: ['html-css'], difficulty: 1,
    stem: 'Which element should wrap the main navigation links of a page?',
    options: [{key:'a',text:'<div>'},{key:'b',text:'<nav>'},{key:'c',text:'<section>'},{key:'d',text:'<menu>'}],
    correctKey: 'b', explanation: '<nav> is the semantic element for navigation. Semantic HTML matters for accessibility and SEO — and interviewers ask about it.' }),
  t({ subskills: ['html-css'], difficulty: 2,
    stem: 'You want three boxes side by side, equal width, with a gap. Simplest modern approach?',
    options: [{key:'a',text:'float: left with margins'},{key:'b',text:'display: flex with gap'},{key:'c',text:'position: absolute'},{key:'d',text:'display: table-cell'}],
    correctKey: 'b', explanation: 'Flexbox with gap. Floats were the 2010 workaround; using them now signals outdated knowledge.' }),
  t({ subskills: ['html-css'], difficulty: 3,
    stem: 'An element has padding: 20px, width: 100px, and box-sizing: border-box. What is its total rendered width?',
    options: [{key:'a',text:'100px'},{key:'b',text:'120px'},{key:'c',text:'140px'},{key:'d',text:'160px'}],
    correctKey: 'a', explanation: 'border-box includes padding inside the declared width. With content-box it would be 140px. This is the single most useful CSS concept to actually understand.' }),
  t({ subskills: ['html-css'], difficulty: 4,
    stem: 'Which selector has the highest specificity?',
    options: [{key:'a',text:'.card .title'},{key:'b',text:'#header'},{key:'c',text:'div.card h2'},{key:'d',text:'h2.title:hover'}],
    correctKey: 'b', explanation: 'IDs (0,1,0,0) beat classes and elements. Specificity explains why "my CSS is not applying" — the most common frontend frustration.' }),

  // ============ REACT / FRONTEND ============
  t({ subskills: ['frontend-framework'], difficulty: 2,
    stem: 'Why does React need a `key` prop when rendering a list?',
    options: [{key:'a',text:'To style each item'},{key:'b',text:'To identify which items changed between renders'},{key:'c',text:'It is optional and only removes a warning'},{key:'d',text:'To sort the list'}],
    correctKey: 'b', explanation: 'Keys let React match elements across renders. Using array index as key causes real bugs when the list reorders.' }),
  t({ subskills: ['frontend-framework'], difficulty: 3,
    stem: 'What is wrong here?', code: "function Counter() {\n  const [count, setCount] = useState(0);\n  return <button onClick={setCount(count + 1)}>{count}</button>;\n}",
    options: [{key:'a',text:'Nothing'},{key:'b',text:'setCount is called during render, not on click — infinite loop'},{key:'c',text:'useState needs an import'},{key:'d',text:'count should be a ref'}],
    correctKey: 'b', explanation: 'onClick needs a function reference: onClick={() => setCount(count + 1)}. As written it calls setCount every render, triggering another render forever.' }),
  t({ subskills: ['frontend-framework'], difficulty: 4,
    stem: 'This useEffect runs on every render instead of once. Why?', code: "useEffect(() => {\n  fetchUser(id);\n});",
    options: [{key:'a',text:'fetchUser is async'},{key:'b',text:'The dependency array is missing'},{key:'c',text:'id must be a string'},{key:'d',text:'useEffect cannot fetch'}],
    correctKey: 'b', explanation: 'No dependency array = run after every render. You want [id]. Missing/wrong deps is the #1 source of React bugs.' }),
  t({ subskills: ['frontend-framework'], difficulty: 4,
    stem: 'You lift state up to a parent so two siblings can share it. What is the main cost?',
    options: [{key:'a',text:'The state becomes read-only'},{key:'b',text:'The parent and all its children re-render on every change'},{key:'c',text:'You cannot use hooks anymore'},{key:'d',text:'It breaks routing'}],
    correctKey: 'b', explanation: 'Lifting state broadens the re-render scope. This is exactly the tradeoff that context, memoisation and state libraries exist to manage.' }),

  // ============ BACKEND ============
  t({ subskills: ['backend-basics'], difficulty: 2,
    stem: 'Which HTTP status code should a successful POST that creates a resource return?',
    options: [{key:'a',text:'200'},{key:'b',text:'201'},{key:'c',text:'204'},{key:'d',text:'302'}],
    correctKey: 'b', explanation: '201 Created. Using 200 for everything is a common giveaway that someone has not thought about API design.' }),
  t({ subskills: ['backend-basics'], difficulty: 3,
    stem: 'Where should a JWT secret live?',
    options: [{key:'a',text:'In the frontend config so the client can verify it'},{key:'b',text:'Committed to the repo for the team'},{key:'c',text:'In a server-side environment variable'},{key:'d',text:'In the JWT payload'}],
    correctKey: 'c', explanation: 'Server-side env var only. If the secret reaches the client, anyone can mint valid tokens and your auth is decorative.' }),
  t({ subskills: ['backend-basics'], difficulty: 3,
    stem: 'What is wrong with this Express route?', code: "app.post('/users', async (req, res) => {\n  const user = await User.create(req.body);\n  res.json(user);\n});",
    options: [{key:'a',text:'Nothing'},{key:'b',text:'No error handling — a rejected promise crashes or hangs the request'},{key:'c',text:'Should use app.get'},{key:'d',text:'res.json cannot send objects'}],
    correctKey: 'b', explanation: 'An async route with no try/catch (or asyncHandler wrapper) leaves rejections unhandled. Also: passing req.body straight to create lets a user set their own role.' }),
  t({ subskills: ['backend-basics'], difficulty: 4,
    stem: 'Your API returns 500 with the full stack trace in production. What is the risk?',
    options: [{key:'a',text:'None — it helps debugging'},{key:'b',text:'It leaks file paths, library versions and internals to attackers'},{key:'c',text:'It slows the server'},{key:'d',text:'It breaks CORS'}],
    correctKey: 'b', explanation: 'Stack traces are reconnaissance. Log them server-side; return a generic message to the client.' }),

  // ============ DATABASES ============
  t({ subskills: ['databases'], difficulty: 2,
    stem: 'What is an index for?',
    options: [{key:'a',text:'Backing up the table'},{key:'b',text:'Making reads faster at the cost of slower writes and more storage'},{key:'c',text:'Encrypting a column'},{key:'d',text:'Enforcing uniqueness only'}],
    correctKey: 'b', explanation: 'Indexes trade write speed and space for read speed. "Add an index" is the right answer to slow queries — until you have added too many.' }),
  t({ subskills: ['databases'], difficulty: 3,
    stem: 'Your query loops over 1000 users and runs one query per user to fetch their orders. What is this called?',
    options: [{key:'a',text:'Batch loading'},{key:'b',text:'The N+1 query problem'},{key:'c',text:'Eager loading'},{key:'d',text:'Sharding'}],
    correctKey: 'b', explanation: 'N+1: 1 query for users, N for orders. Fix with a join or a populate/include. This one question separates people who have hit real performance problems from those who have not.' }),
  t({ subskills: ['databases'], difficulty: 4,
    stem: 'Two requests read a balance of 100, both subtract 30, both write 70. The correct answer was 40. What happened?',
    options: [{key:'a',text:'A race condition — read-modify-write without a transaction or atomic update'},{key:'b',text:'A missing index'},{key:'c',text:'The schema is wrong'},{key:'d',text:'Network latency'}],
    correctKey: 'a', explanation: 'Classic lost update. Fix with an atomic operation ($inc) or a transaction. This is the bug that costs real money in fintech.' }),

  // ============ VERSION CONTROL ============
  t({ subskills: ['version-control'], difficulty: 1,
    stem: 'What does a commit message like "final update 3" tell a reviewer?',
    options: [{key:'a',text:'Everything they need'},{key:'b',text:'Nothing about what changed or why'},{key:'c',text:'That the code is final'},{key:'d',text:'The file names'}],
    correctKey: 'b', explanation: 'Commit messages explain WHY. Your git history is read by your future team — and increasingly by interviewers.' }),
  t({ subskills: ['version-control'], difficulty: 3,
    stem: 'You committed your .env with real API keys, then deleted the file and committed again. Are the keys safe?',
    options: [{key:'a',text:'Yes, the file is deleted'},{key:'b',text:'No — they are still in git history and must be rotated'},{key:'c',text:'Yes, if the repo is private'},{key:'d',text:'Only if you force-push'}],
    correctKey: 'b', explanation: 'Git history keeps everything. Rotate the keys immediately — deleting the file changes nothing. This happens constantly and is a real security incident.' }),

  // ============ PROBLEM SOLVING / DSA ============
  t({ subskills: ['problem-solving'], difficulty: 2, measures: 'potential',
    stem: 'To find one duplicate in a list of 1000 numbers, which is fastest?',
    options: [{key:'a',text:'Compare every pair'},{key:'b',text:'Sort first, then check neighbours'},{key:'c',text:'Track what you have seen in a set as you go once'},{key:'d',text:'Check each number against the whole list'}],
    correctKey: 'c', explanation: 'A single pass with a set: O(n) time. Comparing pairs is O(n²), sorting is O(n log n). Trading memory for speed is the most common optimisation there is.' }),
  t({ subskills: ['problem-solving'], difficulty: 3, measures: 'potential',
    stem: 'A list is already sorted. To find whether a value exists, the fastest approach is:',
    options: [{key:'a',text:'Check every element'},{key:'b',text:'Binary search — halve the range each step'},{key:'c',text:'Sort it again'},{key:'d',text:'Build a hash map first'}],
    correctKey: 'b', explanation: 'Binary search: O(log n). 1000 items in ~10 steps. Recognising "sorted" as a signal is the point.' }),
  t({ subskills: ['problem-solving'], difficulty: 4,
    stem: 'What is the time complexity of a nested loop where the inner loop halves n each time?', code: 'for (let i = 0; i < n; i++) {\n  for (let j = n; j > 0; j = j / 2) { ... }\n}',
    options: [{key:'a',text:'O(n)'},{key:'b',text:'O(n log n)'},{key:'c',text:'O(n²)'},{key:'d',text:'O(log n)'}],
    correctKey: 'b', explanation: 'Outer is O(n), inner halves so O(log n). Multiply: O(n log n).' }),

  // ============ SYSTEM DESIGN ============
  t({ subskills: ['system-design'], difficulty: 4,
    stem: 'Your app is slow because the same expensive query runs on every page load. Cheapest first fix?',
    options: [{key:'a',text:'Rewrite in a faster language'},{key:'b',text:'Cache the result with a sensible TTL'},{key:'c',text:'Add more servers'},{key:'d',text:'Shard the database'}],
    correctKey: 'b', explanation: 'Cache first — cheapest, fastest to ship. Reaching for sharding or rewrites before caching is a red flag in a design interview.' }),
  t({ subskills: ['system-design'], difficulty: 5,
    stem: 'Why is storing session state in server memory a problem when you scale to multiple servers?',
    options: [{key:'a',text:'Memory is expensive'},{key:'b',text:'A user hitting a different server loses their session'},{key:'c',text:'It breaks HTTPS'},{key:'d',text:'It is not a problem'}],
    correctKey: 'b', explanation: 'Stateless servers are the point of horizontal scaling. Put sessions in Redis or use signed tokens — this is exactly why JWTs became popular.' }),

  // ============ TESTING ============
  t({ subskills: ['testing-fundamentals'], difficulty: 1, measures: 'potential',
    stem: 'A login form takes an email and password. Which is the MOST valuable test case to write first?',
    options: [{key:'a',text:'Valid email and correct password'},{key:'b',text:'Empty email with a valid password'},{key:'c',text:'A 500-character email'},{key:'d',text:'Emoji in the password'}],
    correctKey: 'a', explanation: 'The happy path first — if that breaks, nothing else matters. Edge cases come after. Prioritisation is the actual QA skill.' }),
  t({ subskills: ['testing-fundamentals'], difficulty: 2, measures: 'potential',
    stem: 'You find a bug that only happens sometimes. What is the most useful thing to do before reporting it?',
    options: [{key:'a',text:'Report it immediately as "intermittent"'},{key:'b',text:'Find reliable steps to reproduce it'},{key:'c',text:'Fix it yourself'},{key:'d',text:'Ignore it if it is rare'}],
    correctKey: 'b', explanation: 'A bug that cannot be reproduced usually will not be fixed. Finding the reliable trigger is where QA earns its value.' }),
  t({ subskills: ['testing-fundamentals'], difficulty: 3,
    stem: 'What is the difference between a unit test and an integration test?',
    options: [{key:'a',text:'Unit tests are faster to write'},{key:'b',text:'Unit tests check one piece in isolation; integration tests check pieces working together'},{key:'c',text:'Integration tests only run in production'},{key:'d',text:'There is no difference'}],
    correctKey: 'b', explanation: 'Unit = one function, dependencies mocked. Integration = real interaction between parts. Both matter; knowing which to write when is the skill.' }),
  t({ subskills: ['test-automation'], difficulty: 3,
    stem: 'Your automated test fails randomly about 1 in 10 runs. What is this called and what should you do?',
    options: [{key:'a',text:'A flaky test — fix it or delete it, never ignore it'},{key:'b',text:'Normal — just re-run it'},{key:'c',text:'A performance issue'},{key:'d',text:'A false positive — add a longer sleep'}],
    correctKey: 'a', explanation: 'Flaky tests destroy trust in the whole suite. A suite people ignore is worse than no suite. Usually caused by timing assumptions — fix with proper waits, not sleeps.' }),
  t({ subskills: ['test-automation'], difficulty: 4,
    stem: 'Which selector is most likely to survive a UI redesign?',
    options: [{key:'a',text:'div > div:nth-child(3) > button'},{key:'b',text:'[data-testid="submit-order"]'},{key:'c',text:'.btn-primary-large'},{key:'d',text:'button:contains("Submit")'}],
    correctKey: 'b', explanation: 'A dedicated test id survives styling and structure changes. Brittle selectors are why automation suites rot.' }),

  // ============ DESIGN ============
  t({ subskills: ['design-fundamentals'], difficulty: 1, measures: 'potential',
    stem: 'Two blocks of text sit close together, and a third sits far away. What does that spacing communicate?',
    options: [{key:'a',text:'Nothing — spacing is decoration'},{key:'b',text:'The first two are related; the third is separate'},{key:'c',text:'The third is more important'},{key:'d',text:'A layout mistake'}],
    correctKey: 'b', explanation: 'Proximity signals relationship — one of the strongest tools in design. This is why "just add some spacing" often fixes a confusing screen.' }),
  t({ subskills: ['design-fundamentals'], difficulty: 3,
    stem: 'A page has six buttons, all the same size and colour. What is the problem?',
    options: [{key:'a',text:'Too colourful'},{key:'b',text:'No visual hierarchy — the user cannot tell what to do first'},{key:'c',text:'Not enough buttons'},{key:'d',text:'Nothing'}],
    correctKey: 'b', explanation: 'If everything is emphasised, nothing is. One primary action per screen; everything else recedes.' }),
  t({ subskills: ['ux-thinking'], difficulty: 2, measures: 'potential',
    stem: 'Users abandon your signup form. What should you do FIRST?',
    options: [{key:'a',text:'Redesign it to look better'},{key:'b',text:'Watch real users actually use it'},{key:'c',text:'Add more fields to qualify leads'},{key:'d',text:'Change the button colour'}],
    correctKey: 'b', explanation: 'Observe before you solve. Redesigning without knowing why is guessing with extra steps — this instinct is what separates UX from decoration.' }),
  t({ subskills: ['ux-thinking'], difficulty: 3,
    stem: 'A stakeholder says "users want a dashboard". What is the right response?',
    options: [{key:'a',text:'Build the dashboard'},{key:'b',text:'Ask what problem users are trying to solve that a dashboard would fix'},{key:'c',text:'Refuse'},{key:'d',text:'Survey users on dashboard colours'}],
    correctKey: 'b', explanation: 'Users describe solutions; your job is to find the underlying problem. Often the real need is one number in an email.' }),
  t({ subskills: ['design-tools'], difficulty: 2,
    stem: 'In Figma, why use components instead of copy-pasting an element?',
    options: [{key:'a',text:'They render faster'},{key:'b',text:'Changing the main component updates every instance'},{key:'c',text:'They export smaller files'},{key:'d',text:'They are required for prototyping'}],
    correctKey: 'b', explanation: 'Components are reusable and update everywhere — the same reason developers use components. This is the concept that makes design systems possible.' }),

  // ============ AI-ASSISTED DEV ============
  t({ subskills: ['ai-assisted-dev'], difficulty: 2, measures: 'potential',
    stem: 'An AI generates code calling `array.sortBy()` in plain JavaScript. It looks right. What do you do?',
    options: [{key:'a',text:'Ship it — AI knows JavaScript'},{key:'b',text:'Check it exists — that method is not in standard JS'},{key:'c',text:'Rename the variable'},{key:'d',text:'Add a try/catch'}],
    correctKey: 'b', explanation: "sortBy is lodash, not native JS. This is a hallucinated API — the most common AI failure. Plausible-looking code that does not exist is why you must be able to read what it writes." }),
  t({ subskills: ['ai-assisted-dev'], difficulty: 3,
    stem: 'AI writes a working login endpoint. What should you check most carefully?',
    options: [{key:'a',text:'Variable naming'},{key:'b',text:'Security — password hashing, timing attacks, injection, what it leaks on error'},{key:'c',text:'Code comments'},{key:'d',text:'Indentation'}],
    correctKey: 'b', explanation: 'AI produces code that works, not code that is safe. Security holes pass tests silently — this is where human review is non-negotiable.' }),
  t({ subskills: ['ai-assisted-dev'], difficulty: 4,
    stem: 'Which prompt is most likely to produce correct, maintainable code?',
    options: [{key:'a',text:'"make a login page"'},{key:'b',text:'"Build a React login form. Email+password, validate email format client-side, show inline errors, POST to /api/auth/login, handle 401 separately from 500, disable submit while pending. Use our existing Button component."'},{key:'c',text:'"login page, best practices, production ready"'},{key:'d',text:'"you are an expert developer, make login"'}],
    correctKey: 'b', explanation: 'Specification beats incantation. Constraints, edge cases and context produce correct code; role-play prefixes and "production ready" produce confident guesses.' }),

  // ============ XR ============
  t({ subskills: ['xr-fundamentals'], difficulty: 2, measures: 'potential',
    stem: 'In 3D space, an object at position (0,0,0) needs to move 5 units to the right. Which axis usually changes?',
    options: [{key:'a',text:'X'},{key:'b',text:'Y'},{key:'c',text:'Z'},{key:'d',text:'W'}],
    correctKey: 'a', explanation: 'X is horizontal, Y is vertical, Z is depth (in Unity). Comfort with 3D coordinates is the entry requirement for XR.' }),
  t({ subskills: ['xr-fundamentals'], difficulty: 4,
    stem: 'Your VR app runs at 45fps and testers feel nauseous. What matters most?',
    options: [{key:'a',text:'Better textures'},{key:'b',text:'Frame rate — VR needs 90fps to avoid motion sickness'},{key:'c',text:'Louder audio'},{key:'d',text:'More polygons'}],
    correctKey: 'b', explanation: 'Below ~90fps, the mismatch between motion and vision makes people sick. In VR, performance is not polish — it is the product.' }),

  // ============ DATA ============
  t({ subskills: ['data-analysis'], difficulty: 2, measures: 'potential',
    stem: 'Average salary at a company is ₹40L, but most employees earn ₹6L. What explains this?',
    options: [{key:'a',text:'The data is wrong'},{key:'b',text:'A few very high earners drag the mean up — the median tells the real story'},{key:'c',text:'Everyone earns ₹40L'},{key:'d',text:'Inflation'}],
    correctKey: 'b', explanation: 'Outliers wreck the mean. Knowing when to use median over mean is the most practical statistics you can have.' }),
  t({ subskills: ['data-analysis'], difficulty: 3, measures: 'potential',
    stem: 'Ice cream sales and drowning deaths both rise together. What should you conclude?',
    options: [{key:'a',text:'Ice cream causes drowning'},{key:'b',text:'Correlation is not causation — summer heat drives both'},{key:'c',text:'Drowning causes ice cream sales'},{key:'d',text:'The data is fake'}],
    correctKey: 'b', explanation: 'A confounding variable (summer) drives both. Every analyst gets asked this in some form.' }),

  // ============ LOGICAL: NUMERICAL ============
  L({ subskills: ['numerical-reasoning'], difficulty: 1,
    stem: 'A shirt costs ₹800 after a 20% discount. What was the original price?',
    options: [{key:'a',text:'₹960'},{key:'b',text:'₹1000'},{key:'c',text:'₹1200'},{key:'d',text:'₹640'}],
    correctKey: 'b', explanation: '800 is 80% of the original. 800/0.8 = 1000. Discount problems appear in nearly every campus aptitude round.' }),
  L({ subskills: ['numerical-reasoning'], difficulty: 2,
    stem: 'If 5 machines make 5 widgets in 5 minutes, how long do 100 machines take to make 100 widgets?',
    options: [{key:'a',text:'100 minutes'},{key:'b',text:'5 minutes'},{key:'c',text:'20 minutes'},{key:'d',text:'1 minute'}],
    correctKey: 'b', explanation: 'Each machine makes 1 widget in 5 minutes. 100 machines make 100 widgets in the same 5 minutes. The intuitive answer (100) is wrong — that is the point of the question.' }),
  L({ subskills: ['numerical-reasoning'], difficulty: 3,
    stem: 'A train travels 240 km in 3 hours. At the same speed, how far in 5 hours?',
    options: [{key:'a',text:'400 km'},{key:'b',text:'380 km'},{key:'c',text:'420 km'},{key:'d',text:'350 km'}],
    correctKey: 'a', explanation: '240/3 = 80 km/h. 80 × 5 = 400 km. Speed-distance-time is guaranteed to appear in placement tests.' }),
  L({ subskills: ['numerical-reasoning'], difficulty: 4,
    stem: 'A sum doubles in 8 years at simple interest. In how many years does it triple?',
    options: [{key:'a',text:'12'},{key:'b',text:'16'},{key:'c',text:'24'},{key:'d',text:'10'}],
    correctKey: 'b', explanation: 'Doubling = 100% interest in 8 yrs = 12.5%/yr. Tripling needs 200% = 200/12.5 = 16 years.' }),

  // ============ LOGICAL: REASONING ============
  L({ subskills: ['logical-reasoning'], difficulty: 2,
    stem: 'All developers know Git. Priya knows Git. Which follows?',
    options: [{key:'a',text:'Priya is a developer'},{key:'b',text:'Nothing certain follows'},{key:'c',text:'Priya is not a developer'},{key:'d',text:'All Git users are developers'}],
    correctKey: 'b', explanation: 'Affirming the consequent. Knowing Git does not make her a developer — designers and QA use it too. This exact error appears in every logical reasoning section.' }),
  L({ subskills: ['logical-reasoning'], difficulty: 3,
    stem: 'If it rains, the match is cancelled. The match was not cancelled. What follows?',
    options: [{key:'a',text:'It rained'},{key:'b',text:'It did not rain'},{key:'c',text:'Nothing follows'},{key:'d',text:'The match was postponed'}],
    correctKey: 'b', explanation: 'Modus tollens: if P→Q and not-Q, then not-P. Valid and worth internalising.' }),
  L({ subskills: ['logical-reasoning'], difficulty: 4,
    stem: 'Five people sit in a row. A is not at either end. B is immediately right of A. C is at the left end. Where can A NOT be?',
    options: [{key:'a',text:'Position 2'},{key:'b',text:'Position 3'},{key:'c',text:'Position 5'},{key:'d',text:'Position 4'}],
    correctKey: 'c', explanation: 'A is not at an end (rules out 1 and 5), and B must be immediately right of A (so A cannot be 5 anyway). Seating arrangements are a placement-test staple.' }),

  // ============ LOGICAL: PATTERNS ============
  L({ subskills: ['pattern-recognition'], difficulty: 1,
    stem: 'What comes next: 2, 4, 8, 16, ___',
    options: [{key:'a',text:'20'},{key:'b',text:'24'},{key:'c',text:'32'},{key:'d',text:'18'}],
    correctKey: 'c', explanation: 'Each term doubles. 16 × 2 = 32.' }),
  L({ subskills: ['pattern-recognition'], difficulty: 3,
    stem: 'What comes next: 1, 1, 2, 3, 5, 8, ___',
    options: [{key:'a',text:'11'},{key:'b',text:'13'},{key:'c',text:'12'},{key:'d',text:'16'}],
    correctKey: 'b', explanation: 'Fibonacci — each term is the sum of the two before. 5+8 = 13.' }),
  L({ subskills: ['pattern-recognition'], difficulty: 4,
    stem: 'What comes next: 4, 9, 16, 25, ___',
    options: [{key:'a',text:'30'},{key:'b',text:'36'},{key:'c',text:'35'},{key:'d',text:'49'}],
    correctKey: 'b', explanation: 'Perfect squares: 2²,3²,4²,5², so 6² = 36.' }),

  // ============ LOGICAL: DATA INTERPRETATION ============
  L({ subskills: ['data-interpretation'], difficulty: 2,
    stem: 'A company had 200 employees in 2023 and 250 in 2024. What is the percentage increase?',
    options: [{key:'a',text:'20%'},{key:'b',text:'25%'},{key:'c',text:'50%'},{key:'d',text:'12.5%'}],
    correctKey: 'b', explanation: '(250-200)/200 = 25%. Percentage change is always relative to the ORIGINAL — the most common mistake is dividing by the new number.' }),
  L({ subskills: ['data-interpretation'], difficulty: 3,
    stem: 'Sales: Q1 ₹10L, Q2 ₹15L, Q3 ₹12L, Q4 ₹18L. What is the average quarterly sales?',
    options: [{key:'a',text:'₹13.75L'},{key:'b',text:'₹14L'},{key:'c',text:'₹13.5L'},{key:'d',text:'₹15L'}],
    correctKey: 'a', explanation: '(10+15+12+18)/4 = 55/4 = 13.75L.' }),

  // ============ VERBAL: GRAMMAR ============
  V({ subskills: ['grammar-usage'], difficulty: 1,
    stem: 'Choose the correct sentence:',
    options: [
      {key:'a',text:'The team have completed their project.'},
      {key:'b',text:'The team has completed its project.'},
      {key:'c',text:'The team have completed its project.'},
      {key:'d',text:'The team has completed their project.'}],
    correctKey: 'b', explanation: 'In Indian and American usage, collective nouns like "team" take a singular verb and singular pronoun. Subject-verb agreement is the most-tested grammar point in placements.' }),
  V({ subskills: ['grammar-usage'], difficulty: 2,
    stem: 'Which is correct?',
    options: [
      {key:'a',text:'I have completed my graduation in 2023.'},
      {key:'b',text:'I completed my graduation in 2023.'},
      {key:'c',text:'I am completed graduation in 2023.'},
      {key:'d',text:'I have complete my graduation in 2023.'}],
    correctKey: 'b', explanation: 'A finished action at a stated past time takes simple past, not present perfect. "I have completed... in 2023" is one of the most common errors in Indian resumes — and interviewers notice.' }),
  V({ subskills: ['grammar-usage'], difficulty: 3,
    stem: 'Choose the correct sentence:',
    options: [
      {key:'a',text:'Neither the manager nor the developers was aware.'},
      {key:'b',text:'Neither the manager nor the developers were aware.'},
      {key:'c',text:'Neither the manager or the developers were aware.'},
      {key:'d',text:'Neither of the manager nor developers were aware.'}],
    correctKey: 'b', explanation: 'With neither/nor, the verb agrees with the NEARER subject — "developers" is plural, so "were".' }),
  V({ subskills: ['grammar-usage'], difficulty: 4,
    stem: 'Which sentence is free of a dangling modifier?',
    options: [
      {key:'a',text:'Having finished the code, the tests were run.'},
      {key:'b',text:'Having finished the code, she ran the tests.'},
      {key:'c',text:'Having finished the code, the deadline approached.'},
      {key:'d',text:'Having finished the code, it was deployed.'}],
    correctKey: 'b', explanation: 'The modifier must attach to the one who finished the code. In the others, the tests/deadline/it appear to have written the code.' }),

  // ============ VERBAL: READING COMPREHENSION ============
  V({ subskills: ['reading-comprehension'], difficulty: 3,
    stem: 'Read: "The company\'s new policy, while ostensibly designed to improve productivity, has instead created bottlenecks — teams now wait days for approvals that previously took hours. Management maintains the policy is working."\n\nWhat is the author\'s attitude towards the policy?',
    options: [
      {key:'a',text:'Supportive'},{key:'b',text:'Sceptical'},{key:'c',text:'Neutral'},{key:'d',text:'Enthusiastic'}],
    correctKey: 'b', explanation: '"Ostensibly", "instead", and the contrast with management\'s claim all signal scepticism. RC tests whether you read tone, not just facts.' }),
  V({ subskills: ['reading-comprehension'], difficulty: 4,
    stem: 'Read: "Remote work increased output for individual tasks but reduced the spontaneous exchanges that generate new ideas. Firms optimising purely for measurable productivity may be trading tomorrow\'s innovation for today\'s numbers."\n\nWhat does the author imply?',
    options: [
      {key:'a',text:'Remote work is bad'},
      {key:'b',text:'Measurable short-term gains may hide unmeasured long-term costs'},
      {key:'c',text:'Innovation is not important'},
      {key:'d',text:'Firms should stop measuring productivity'}],
    correctKey: 'b', explanation: 'The point is the trade-off between what is easy to measure and what matters later — not a verdict on remote work. Inference questions test what is implied, not stated.' }),

  // ============ VERBAL: WRITTEN EXPRESSION (AI-graded) ============
  { dimension: 'verbal', subskills: ['written-expression'], type: 'free-text', difficulty: 3, status: 'live',
    stem: 'In 3–4 sentences, explain to a non-technical person what an API is. Do not use the words "interface" or "endpoint".',
    timeLimitSec: 180,
    rubric: 'Score 0-100. Look for: (1) a concrete analogy a layperson would grasp, (2) conveys that it lets two programs talk without knowing each other\'s internals, (3) clear sentences without jargon, (4) correct grammar. 80+: vivid analogy, accurate, well written. 60-79: accurate but plain or slightly jargon-heavy. 40-59: partially accurate or confusing. Below 40: inaccurate or incoherent.',
    explanation: 'Explaining technical things to non-technical people is a real, tested job skill — in interviews, in stand-ups, and with clients.' },
];
