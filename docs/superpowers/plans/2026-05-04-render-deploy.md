# Render Free Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the existing EMT Scenario Trainer to a public URL on Render free tier with abuse guards (kill switch, daily token meter) and clear cold-start UX.

**Architecture:** Single Render Web Service. Express on `$PORT` serves both `/api/*` (existing routes) and the production React build (`dist/`) from the same origin. SQLite stays ephemeral on free tier; per-student state lives in browser sessionStorage. Two new pieces of middleware (kill switch + daily token meter) bound abuse exposure since the service has no auth.

**Tech Stack:** Node 20+, Express, better-sqlite3, OpenAI SDK v5, React 19 + Vite, Render free tier, GitHub remote, supertest for route tests.

**Spec reference:** `docs/superpowers/specs/2026-05-04-render-deploy-design.md`

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `services/abuseGuards.js` | `killSwitch` middleware + `makeTokenMeter` factory (guard + recordUsage + snapshot) |
| Create | `test/abuseGuards.test.js` | Unit tests for both pieces |
| Create | `render.yaml` | Render IaC: build command, start command, env var slots |
| Modify | `server.js` | Wire `killSwitch` and token meter; serve `dist/` static + SPA fallback; pass meter into service factories |
| Modify | `package.json` | `engines: { node: ">=20" }` (already has build/start scripts) |
| Modify | `routes/chat.js` | Accept optional `tokenGuard` and apply to `POST /` |
| Modify | `routes/scenarios.js` | Accept optional `tokenGuard` and apply to `POST /scenarios` |
| Modify | `routes/sessions.js` | Accept optional `tokenGuard` and apply to `POST /:id/grade` |
| Modify | `services/chatService.js` | Accept `tokenMeter` and call `recordUsage` after each OpenAI call |
| Modify | `services/scenarioGenerator.js` | Accept `tokenMeter` and call `recordUsage` |
| Modify | `services/gradingService.js` | Accept `tokenMeter` and call `recordUsage` |
| Modify | `test/chatService.test.js` | Update `fakeOpenAI` to return `usage`; add a meter-recording assertion |
| Modify | `src/pages/SelectionScreen.jsx` | One-line cold-start notice |
| Modify | `CLAUDE.md` | Append "Deployment" section |

No file has > ~150 LOC after changes. Tests stay co-located in `test/`.

---

## Task 1: Pin Node version in package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `engines` field**

In `package.json`, after the `"version"` line and before `"scripts"`, insert:

```json
  "engines": {
    "node": ">=20"
  },
```

- [ ] **Step 2: Verify the file still parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"`
Expected: no output (silent success).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: pin Node engine to >=20 for Render"
```

---

## Task 2: Create killSwitch middleware (TDD)

**Files:**
- Create: `services/abuseGuards.js`
- Create: `test/abuseGuards.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/abuseGuards.test.js`:

```js
const assert = require('assert');
const { killSwitch } = require('../services/abuseGuards');

function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
  return res;
}

exports.tests = [
  {
    name: 'killSwitch returns 503 when SERVICE_DISABLED=true',
    fn: () => {
      const prev = process.env.SERVICE_DISABLED;
      process.env.SERVICE_DISABLED = 'true';
      const res = makeRes();
      let nextCalled = false;
      killSwitch({}, res, () => { nextCalled = true; });
      process.env.SERVICE_DISABLED = prev;
      assert.strictEqual(res.statusCode, 503);
      assert.strictEqual(nextCalled, false);
      assert.match(res.body.error, /disabled/i);
    },
  },
  {
    name: 'killSwitch calls next when SERVICE_DISABLED is unset',
    fn: () => {
      const prev = process.env.SERVICE_DISABLED;
      delete process.env.SERVICE_DISABLED;
      const res = makeRes();
      let nextCalled = false;
      killSwitch({}, res, () => { nextCalled = true; });
      process.env.SERVICE_DISABLED = prev;
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(nextCalled, true);
    },
  },
  {
    name: 'killSwitch calls next when SERVICE_DISABLED is "false"',
    fn: () => {
      const prev = process.env.SERVICE_DISABLED;
      process.env.SERVICE_DISABLED = 'false';
      const res = makeRes();
      let nextCalled = false;
      killSwitch({}, res, () => { nextCalled = true; });
      process.env.SERVICE_DISABLED = prev;
      assert.strictEqual(nextCalled, true);
    },
  },
];
```

- [ ] **Step 2: Run tests; confirm failure**

Run: `npm test 2>&1 | grep abuseGuards`
Expected: 3 failures with "Cannot find module '../services/abuseGuards'".

- [ ] **Step 3: Implement killSwitch**

Create `services/abuseGuards.js`:

```js
function killSwitch(req, res, next) {
  if (process.env.SERVICE_DISABLED === 'true') {
    return res.status(503).json({ error: 'service temporarily disabled' });
  }
  next();
}

module.exports = { killSwitch };
```

- [ ] **Step 4: Run tests; confirm pass**

Run: `npm test 2>&1 | grep abuseGuards`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add services/abuseGuards.js test/abuseGuards.test.js
git commit -m "feat(abuseGuards): add killSwitch middleware"
```

---

## Task 3: Add dailyTokenMeter to abuseGuards (TDD)

**Files:**
- Modify: `services/abuseGuards.js`
- Modify: `test/abuseGuards.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `test/abuseGuards.test.js` (inside the `exports.tests` array, before the closing `]`):

```js
  {
    name: 'tokenMeter starts at zero and accepts recordUsage',
    fn: () => {
      const { makeTokenMeter } = require('../services/abuseGuards');
      const meter = makeTokenMeter({ defaultBudget: 1000, now: () => new Date('2026-05-04T12:00:00Z') });
      assert.strictEqual(meter.snapshot().tokens, 0);
      meter.recordUsage(100, 50);
      assert.strictEqual(meter.snapshot().tokens, 150);
      meter.recordUsage(0, 25);
      assert.strictEqual(meter.snapshot().tokens, 175);
    },
  },
  {
    name: 'tokenMeter guard passes when under budget',
    fn: () => {
      const { makeTokenMeter } = require('../services/abuseGuards');
      const meter = makeTokenMeter({ defaultBudget: 1000, now: () => new Date('2026-05-04T12:00:00Z') });
      meter.recordUsage(500, 0);
      const res = makeRes();
      let nextCalled = false;
      meter.guardMiddleware({}, res, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true);
      assert.strictEqual(res.statusCode, 200);
    },
  },
  {
    name: 'tokenMeter guard returns 503 when at or over budget',
    fn: () => {
      const { makeTokenMeter } = require('../services/abuseGuards');
      const meter = makeTokenMeter({ defaultBudget: 1000, now: () => new Date('2026-05-04T12:00:00Z') });
      meter.recordUsage(1000, 0);
      const res = makeRes();
      let nextCalled = false;
      meter.guardMiddleware({}, res, () => { nextCalled = true; });
      assert.strictEqual(res.statusCode, 503);
      assert.strictEqual(nextCalled, false);
      assert.match(res.body.error, /quota/i);
    },
  },
  {
    name: 'tokenMeter rolls over when UTC date changes',
    fn: () => {
      const { makeTokenMeter } = require('../services/abuseGuards');
      let clock = new Date('2026-05-04T23:30:00Z');
      const meter = makeTokenMeter({ defaultBudget: 1000, now: () => clock });
      meter.recordUsage(900, 0);
      assert.strictEqual(meter.snapshot().tokens, 900);
      clock = new Date('2026-05-05T00:30:00Z');
      meter.recordUsage(10, 0);
      assert.strictEqual(meter.snapshot().tokens, 10);
      assert.strictEqual(meter.snapshot().date, '2026-05-05');
    },
  },
  {
    name: 'tokenMeter reads DAILY_TOKEN_BUDGET env var when present',
    fn: () => {
      const { makeTokenMeter } = require('../services/abuseGuards');
      const prev = process.env.DAILY_TOKEN_BUDGET;
      process.env.DAILY_TOKEN_BUDGET = '500';
      const meter = makeTokenMeter({ defaultBudget: 1000, now: () => new Date('2026-05-04T12:00:00Z') });
      assert.strictEqual(meter.snapshot().budget, 500);
      process.env.DAILY_TOKEN_BUDGET = prev;
    },
  },
```

- [ ] **Step 2: Run tests; confirm failure**

Run: `npm test 2>&1 | grep abuseGuards`
Expected: 5 new failures with "makeTokenMeter is not a function" or similar.

- [ ] **Step 3: Implement makeTokenMeter**

Replace `services/abuseGuards.js` with:

```js
function killSwitch(req, res, next) {
  if (process.env.SERVICE_DISABLED === 'true') {
    return res.status(503).json({ error: 'service temporarily disabled' });
  }
  next();
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function makeTokenMeter({ defaultBudget = 200_000, now = () => new Date() } = {}) {
  let date = ymd(now());
  let tokens = 0;

  function maybeRoll() {
    const today = ymd(now());
    if (today !== date) { date = today; tokens = 0; }
  }

  function getBudget() {
    const raw = process.env.DAILY_TOKEN_BUDGET;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : defaultBudget;
  }

  function recordUsage(promptTokens = 0, completionTokens = 0) {
    maybeRoll();
    tokens += (Number(promptTokens) || 0) + (Number(completionTokens) || 0);
  }

  function guardMiddleware(req, res, next) {
    maybeRoll();
    if (tokens >= getBudget()) {
      return res.status(503).json({ error: 'daily token quota reached, try again tomorrow' });
    }
    next();
  }

  function snapshot() {
    maybeRoll();
    return { date, tokens, budget: getBudget() };
  }

  return { recordUsage, guardMiddleware, snapshot };
}

module.exports = { killSwitch, makeTokenMeter };
```

- [ ] **Step 4: Run tests; confirm pass**

Run: `npm test 2>&1 | grep abuseGuards`
Expected: 8 passing (3 killSwitch + 5 tokenMeter).

- [ ] **Step 5: Commit**

```bash
git add services/abuseGuards.js test/abuseGuards.test.js
git commit -m "feat(abuseGuards): add daily token meter with rollover"
```

---

## Task 4: Wire token meter into chatService (TDD)

**Files:**
- Modify: `services/chatService.js`
- Modify: `test/chatService.test.js`

- [ ] **Step 1: Update `fakeOpenAI` to return usage data and add a recording test**

Edit `test/chatService.test.js`. Replace the `fakeOpenAI` helper with:

```js
function fakeOpenAI(reply, usage = { prompt_tokens: 100, completion_tokens: 50 }) {
  const fake = {
    lastMessages: null,
    chat: {
      completions: {
        create: async ({ messages }) => {
          fake.lastMessages = messages;
          return { choices: [{ message: { role: 'assistant', content: reply } }], usage };
        },
      },
    },
  };
  return fake;
}
```

Then append this test inside the `exports.tests` array:

```js
  {
    name: 'records token usage to the meter when one is provided',
    fn: async () => {
      setup();
      const recorded = [];
      const fakeMeter = { recordUsage: (p, c) => recorded.push([p, c]) };
      const svc = makeChatService({
        openai: fakeOpenAI('hi', { prompt_tokens: 42, completion_tokens: 7 }),
        tokenMeter: fakeMeter,
      });
      await svc.handleMessage({ sessionId: null, message: 'hello' });
      assert.deepStrictEqual(recorded, [[42, 7]]);
    },
  },
```

- [ ] **Step 2: Run tests; confirm failure on the new test**

Run: `npm test 2>&1 | grep "records token usage"`
Expected: FAIL — `recorded` is `[]` (the service doesn't call the meter yet).

- [ ] **Step 3: Modify `services/chatService.js` to accept and call the meter**

In `services/chatService.js`, change the factory signature and add the recording call. Replace the `makeChatService` function with:

```js
function makeChatService({ openai, model = DEFAULT_MODEL, summarizer = null, tokenMeter = null }) {
  async function handleMessage({ sessionId, message }) {
    if (!message || !message.trim()) {
      throw new Error('message is required');
    }
    let id = sessionId;
    if (!id || !sm.getSession(id)) {
      id = sm.createSession();
    }
    sm.appendMessage(id, 'user', message);
    const history = sm.getHistory(id);
    const completion = await openai.chat.completions.create({
      model,
      messages: history,
    });
    if (tokenMeter && completion.usage) {
      tokenMeter.recordUsage(completion.usage.prompt_tokens, completion.usage.completion_tokens);
    }
    const reply = completion.choices[0].message.content;
    sm.appendMessage(id, 'assistant', reply);
    const vitalsDelta = parseVitals(reply);
    if (vitalsDelta) applyVitals(id, vitalsDelta);
    if (summarizer) {
      try { await summarizer.maybeSummarize(id); } catch (e) { console.error('[summarizer]', e); }
    }
    return { sessionId: id, reply };
  }
  return { handleMessage };
}
```

- [ ] **Step 4: Run tests; confirm all pass**

Run: `npm test 2>&1 | tail -3`
Expected: all tests passing (28 prior + 5 abuseGuards + 1 new = 34, but the 3 existing chatService tests still pass since `tokenMeter` is optional).

- [ ] **Step 5: Commit**

```bash
git add services/chatService.js test/chatService.test.js
git commit -m "feat(chatService): record token usage to optional meter"
```

---

## Task 5: Wire token meter into scenarioGenerator (TDD)

**Files:**
- Modify: `services/scenarioGenerator.js`
- Modify: `test/scenarioGenerator.test.js`

- [ ] **Step 1: Append a recording test**

`test/scenarioGenerator.test.js` already has a `validJson` string constant at the top (a stringified valid scenario). Reuse it. Append this test to the `exports.tests` array:

```js
  {
    name: 'records token usage to the meter when provided',
    fn: async () => {
      const recorded = [];
      const fakeMeter = { recordUsage: (p, c) => recorded.push([p, c]) };
      const fakeOpenAIWithUsage = {
        chat: { completions: {
          create: async () => ({
            choices: [{ message: { content: validJson } }],
            usage: { prompt_tokens: 200, completion_tokens: 80 },
          }),
        }},
      };
      const gen = makeScenarioGenerator({ openai: fakeOpenAIWithUsage, tokenMeter: fakeMeter });
      await gen.generate('trauma', 'MVC');
      assert.deepStrictEqual(recorded, [[200, 80]]);
    },
  },
```

- [ ] **Step 2: Run tests; confirm failure on the new test**

Run: `npm test 2>&1 | grep "records token usage to the meter"`
Expected: FAIL on the scenarioGenerator test.

- [ ] **Step 3: Modify `services/scenarioGenerator.js`**

Change the factory to accept `tokenMeter` and record after the OpenAI call. Replace the `makeScenarioGenerator` function with:

```js
function makeScenarioGenerator({ openai, model = DEFAULT_MODEL, tokenMeter = null }) {
  async function generate(type, subtype) {
    if (!isValid(type, subtype)) throw new Error(`invalid type/subtype: ${type}/${subtype}`);
    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: getTemplate(type, subtype) },
      ],
    });
    if (tokenMeter && completion.usage) {
      tokenMeter.recordUsage(completion.usage.prompt_tokens, completion.usage.completion_tokens);
    }
    const raw = completion.choices[0].message.content;
    const parsed = JSON.parse(raw);
    if (!parsed.patientProfile || !parsed.environment || !parsed.physicalFindings) {
      throw new Error('scenario missing required fields');
    }
    return parsed;
  }
  return { generate };
}
```

- [ ] **Step 4: Run tests; confirm pass**

Run: `npm test 2>&1 | tail -3`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add services/scenarioGenerator.js test/scenarioGenerator.test.js
git commit -m "feat(scenarioGenerator): record token usage to optional meter"
```

---

## Task 6: Wire token meter into gradingService (TDD)

**Files:**
- Modify: `services/gradingService.js`
- Modify: `test/gradingService.test.js`

- [ ] **Step 1: Append a recording test**

Append to `test/gradingService.test.js` `exports.tests`:

```js
  {
    name: 'gradeSession records token usage to the meter when provided',
    fn: async () => {
      const { resetForTests, getDb } = require('../database/databaseManager');
      const sm = require('../services/sessionManager');
      const { makeGradingService } = require('../services/gradingService');
      resetForTests();
      getDb(':memory:');
      const sid = sm.createSession();
      sm.setScenario(sid, 'medical', JSON.stringify({
        type: 'medical', subtype: 'Cardiac', dispatch: 'd',
        patientProfile: { name: 'X', age: 60, sex: 'male', chiefComplaint: 'chest pain', vitals: { hr: 90, bp: '140/90', rr: 18, spo2: 96, gcs: 15 } },
        currentVitals: { hr: 90, bp: '140/90', rr: 18, spo2: 96, gcs: 15 },
        expectedAssessment: 'medical',
      }));
      sm.appendMessage(sid, 'user', 'check vitals');
      sm.appendMessage(sid, 'assistant', '[Moderator] HR 90');

      const recorded = [];
      const fakeMeter = { recordUsage: (p, c) => recorded.push([p, c]) };
      const fakeOpenAI = {
        chat: {
          completions: {
            create: async () => ({
              choices: [{ message: { content: JSON.stringify({
                overall: { score: 50, summary: 's' },
                rubric: [{ criterion: 'Vital signs obtained', score: 0, quotes: [], feedback: 'none' }],
                strengths: [], improvements: [],
              }) } }],
              usage: { prompt_tokens: 1500, completion_tokens: 400 },
            }),
          },
        },
      };
      const svc = makeGradingService({ openai: fakeOpenAI, tokenMeter: fakeMeter });
      await svc.gradeSession(sid);
      assert.deepStrictEqual(recorded, [[1500, 400]]);
    },
  },
```

- [ ] **Step 2: Run tests; confirm failure**

Run: `npm test 2>&1 | grep "gradeSession records"`
Expected: FAIL.

- [ ] **Step 3: Modify `services/gradingService.js`**

In the `makeGradingService` factory, accept `tokenMeter` and record after the OpenAI call. Replace the function with:

```js
function makeGradingService({ openai, model = DEFAULT_MODEL, tokenMeter = null }) {
  async function gradeSession(sessionId) {
    const row = sm.getSession(sessionId);
    if (!row) throw new Error('session not found');
    const state = row.state ? JSON.parse(row.state) : null;
    if (!state) throw new Error('no scenario on session');
    const history = sm.getHistory(sessionId).filter((m) => m.role !== 'system');
    const rubric = RUBRIC[state.expectedAssessment] || RUBRIC.medical;

    const transcript = history
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const userMsg = [
      `Scenario: ${state.type} / ${state.subtype}`,
      `Dispatch: ${state.dispatch}`,
      `Patient: ${state.patientProfile.name}, ${state.patientProfile.age}${state.patientProfile.sex[0]}, CC ${state.patientProfile.chiefComplaint}`,
      `Initial vitals: ${JSON.stringify(state.patientProfile.vitals)}`,
      `Final vitals: ${JSON.stringify(state.currentVitals)}`,
      '',
      `Rubric criteria to score (in order):\n- ${rubric.join('\n- ')}`,
      '',
      'Transcript:',
      transcript,
    ].join('\n');

    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
    });
    if (tokenMeter && completion.usage) {
      tokenMeter.recordUsage(completion.usage.prompt_tokens, completion.usage.completion_tokens);
    }
    const raw = completion.choices[0].message.content;
    const parsed = JSON.parse(raw);
    if (!parsed.overall || !parsed.rubric) throw new Error('grading result missing fields');

    const audited = auditGrade(parsed, history);

    state.grade = audited;
    sm.setScenario(sessionId, row.scenario_type, JSON.stringify(state));
    return audited;
  }
  return { gradeSession };
}
```

- [ ] **Step 4: Run tests; confirm pass**

Run: `npm test 2>&1 | tail -3`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add services/gradingService.js test/gradingService.test.js
git commit -m "feat(gradingService): record token usage to optional meter"
```

---

## Task 7: Add tokenGuard to chat router (TDD via supertest)

**Files:**
- Modify: `routes/chat.js`
- Modify: `test/chatRoute.test.js`

- [ ] **Step 1: Append a failing test**

Append to `test/chatRoute.test.js` `exports.tests`:

```js
  {
    name: 'POST /api/chat returns 503 when tokenGuard rejects',
    fn: async () => {
      const express = require('express');
      const request = require('supertest');
      const { createChatRouter } = require('../routes/chat');
      const app = express();
      app.use(express.json());
      const tokenGuard = (req, res) => res.status(503).json({ error: 'quota' });
      app.use('/api/chat', createChatRouter({ handleMessage: async () => ({ sessionId: 'x', reply: 'r' }) }, tokenGuard));
      const res = await request(app).post('/api/chat').send({ message: 'hi' });
      assert.strictEqual(res.status, 503);
      assert.match(res.body.error, /quota/);
    },
  },
```

- [ ] **Step 2: Run; confirm failure**

Run: `npm test 2>&1 | grep "tokenGuard rejects"`
Expected: FAIL — guard isn't wired.

- [ ] **Step 3: Modify `routes/chat.js`**

Change the factory signature to accept an optional second positional `tokenGuard`, defaulting to a no-op. Replace `routes/chat.js` with:

```js
const express = require('express');

function createChatRouter(chatService, tokenGuard) {
  const router = express.Router();
  const guard = tokenGuard || ((req, res, next) => next());
  router.post('/', guard, async (req, res) => {
    const { sessionId = null, message } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }
    try {
      const result = await chatService.handleMessage({ sessionId, message });
      res.json(result);
    } catch (err) {
      console.error('[chat] error:', err);
      res.status(500).json({ error: 'internal error' });
    }
  });
  return router;
}

module.exports = { createChatRouter };
```

- [ ] **Step 4: Run tests; confirm all pass**

Run: `npm test 2>&1 | tail -3`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add routes/chat.js test/chatRoute.test.js
git commit -m "feat(routes/chat): accept optional tokenGuard"
```

---

## Task 8: Add tokenGuard to scenarios router (TDD)

**Files:**
- Modify: `routes/scenarios.js`
- Modify: `test/scenariosRoute.test.js`

- [ ] **Step 1: Append failing test**

Append to `test/scenariosRoute.test.js` `exports.tests`:

```js
  {
    name: 'POST /api/scenarios returns 503 when tokenGuard rejects',
    fn: async () => {
      setup();
      const tokenGuard = (req, res) => res.status(503).json({ error: 'quota' });
      const app = createApp({
        chatService: fakeChatService(),
        scenarioGenerator: fakeScenarioGen(),
        tokenGuard,
      });
      const res = await request(app).post('/api/scenarios').send({ type: 'trauma', subtype: 'MVC' });
      assert.strictEqual(res.status, 503);
      assert.match(res.body.error, /quota/);
    },
  },
  {
    name: 'GET /api/scenario-types is NOT gated by tokenGuard',
    fn: async () => {
      setup();
      const tokenGuard = (req, res) => res.status(503).json({ error: 'quota' });
      const app = createApp({
        chatService: fakeChatService(),
        scenarioGenerator: fakeScenarioGen(),
        tokenGuard,
      });
      const res = await request(app).get('/api/scenario-types');
      assert.strictEqual(res.status, 200);
    },
  },
```

- [ ] **Step 2: Run; confirm failure (both new tests)**

Run: `npm test 2>&1 | grep "tokenGuard"`
Expected: at least one new failure.

- [ ] **Step 3: Modify `routes/scenarios.js` with three precise edits**

This file has a long `systemMsg` array defining the patient/moderator/bystander roleplay rules — leave it untouched. Make exactly these three edits:

**Edit 1** — function signature. Find:
```js
function createScenarioRouter(scenarioGenerator) {
  const router = express.Router();
```
Change to:
```js
function createScenarioRouter(scenarioGenerator, tokenGuard) {
  const router = express.Router();
  const guard = tokenGuard || ((req, res, next) => next());
```

**Edit 2** — gate the POST. Find:
```js
  router.post('/scenarios', async (req, res) => {
```
Change to:
```js
  router.post('/scenarios', guard, async (req, res) => {
```

**Edit 3** — verify the GET is unchanged (it is `router.get('/scenario-types', ...)` and stays exactly as written; do not add `guard` to it).

Nothing else in the file changes.

- [ ] **Step 4: Run tests; confirm pass**

Run: `npm test 2>&1 | tail -3`
Expected: all passing. NOTE: The new tests assume `createApp` accepts `tokenGuard` — that wiring lands in **Task 9**. The new tests will continue to fail until then. Skip Step 5 below until Task 9 is done.

- [ ] **Step 5: Defer commit until Task 9**

Hold these changes uncommitted; they get bundled with Task 9's `createApp` update.

---

## Task 9: Add tokenGuard to sessions router AND wire createApp (TDD)

**Files:**
- Modify: `routes/sessions.js`
- Modify: `server.js`
- Create: `test/sessionsRoute.test.js` (new file)

- [ ] **Step 1: Write failing tests for sessions router**

Create `test/sessionsRoute.test.js`:

```js
const assert = require('assert');
const request = require('supertest');
const { resetForTests, getDb } = require('../database/databaseManager');
const { createApp } = require('../server');
const sm = require('../services/sessionManager');

function setup() { resetForTests(); getDb(':memory:'); }

exports.tests = [
  {
    name: 'GET /api/sessions/:id is NOT gated by tokenGuard',
    fn: async () => {
      setup();
      const sid = sm.createSession();
      sm.setScenario(sid, 'trauma', JSON.stringify({
        type: 'trauma', subtype: 'MVC', dispatch: 'd',
        patientProfile: { name: 'X', age: 30, sex: 'male', chiefComplaint: 'c', vitals: { hr: 80, bp: '120/80', rr: 16, spo2: 99, gcs: 15 } },
        environment: { location: 'l', weather: 'w', lighting: 'l', hazards: [] },
        bystanders: [],
        physicalFindings: { general: 'g', head: 'h', face: 'f', neck: 'n', chest: 'c', abdomen: 'a', pelvis: 'p', back: 'b', extremities: 'e', skin: 's', neuro: 'n' },
        expectedAssessment: 'trauma',
        currentVitals: { hr: 80 },
      }));
      const tokenGuard = (req, res) => res.status(503).json({ error: 'quota' });
      const app = createApp({ tokenGuard });
      const res = await request(app).get(`/api/sessions/${sid}`);
      assert.strictEqual(res.status, 200);
    },
  },
  {
    name: 'POST /api/sessions/:id/grade returns 503 when tokenGuard rejects',
    fn: async () => {
      setup();
      const sid = sm.createSession();
      sm.setScenario(sid, 'trauma', JSON.stringify({
        type: 'trauma', subtype: 'MVC', dispatch: 'd',
        patientProfile: { name: 'X', age: 30, sex: 'male', chiefComplaint: 'c', vitals: {} },
        currentVitals: {},
        expectedAssessment: 'trauma',
      }));
      const tokenGuard = (req, res) => res.status(503).json({ error: 'quota' });
      const app = createApp({ gradingService: { gradeSession: async () => ({}) }, tokenGuard });
      const res = await request(app).post(`/api/sessions/${sid}/grade`);
      assert.strictEqual(res.status, 503);
    },
  },
];
```

- [ ] **Step 2: Run tests; confirm failure**

Run: `npm test 2>&1 | grep "sessions"`
Expected: failures (both new tests, plus the deferred Task 8 tests).

- [ ] **Step 3: Modify `routes/sessions.js`**

Replace the `createSessionsRouter` function:

```js
function createSessionsRouter({ gradingService, tokenGuard } = {}) {
  const router = express.Router();
  const guard = tokenGuard || ((req, res, next) => next());

  router.get('/:id', (req, res) => {
    const row = sm.getSession(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    const state = row.state ? JSON.parse(row.state) : null;
    const messages = sm.getHistory(req.params.id).filter((m) => m.role !== 'system');
    res.json({
      sessionId: row.id,
      scenarioType: row.scenario_type,
      scenario: state,
      currentVitals: state?.currentVitals ?? state?.patientProfile?.vitals ?? null,
      bystanders: state?.bystanders ?? [],
      messages,
    });
  });

  router.post('/:id/grade', guard, async (req, res) => {
    if (!gradingService) return res.status(501).json({ error: 'grading not enabled' });
    try {
      const result = await gradingService.gradeSession(req.params.id);
      res.json(result);
    } catch (err) {
      console.error('[grade] error:', err);
      res.status(500).json({ error: 'grading failed' });
    }
  });

  return router;
}
```

- [ ] **Step 4: Modify `server.js` `createApp` to accept and propagate tokenGuard**

In `server.js`, replace the `createApp` function with:

```js
function createApp({ chatService, scenarioGenerator, gradingService, tokenGuard } = {}) {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/', rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/', killSwitch);
  app.use('/api/chat', createChatRouter(chatService, tokenGuard));
  app.use('/api', createScenarioRouter(scenarioGenerator, tokenGuard));
  app.use('/api/sessions', createSessionsRouter({ gradingService, tokenGuard }));
  return app;
}
```

Add at the top of `server.js`, alongside the existing requires:

```js
const { killSwitch, makeTokenMeter } = require('./services/abuseGuards');
```

Also update the `start` function in `server.js` to construct the meter and pass everything down:

```js
function start() {
  const openai = require('./config/openai');
  const { makeChatService } = require('./services/chatService');
  const { makeScenarioGenerator } = require('./services/scenarioGenerator');
  const { makeGradingService } = require('./services/gradingService');
  const { makeSummarizer } = require('./services/conversationSummarizer');
  const tokenMeter = makeTokenMeter();
  const summarizer = makeSummarizer({ openai });
  const chatService = makeChatService({ openai, summarizer, tokenMeter });
  const scenarioGenerator = makeScenarioGenerator({ openai, tokenMeter });
  const gradingService = makeGradingService({ openai, tokenMeter });
  const app = createApp({ chatService, scenarioGenerator, gradingService, tokenGuard: tokenMeter.guardMiddleware });
  const port = Number(process.env.PORT) || 3001;
  app.listen(port, () => console.log(`[server] listening on :${port}`));
}
```

- [ ] **Step 5: Run tests; confirm pass**

Run: `npm test 2>&1 | tail -3`
Expected: all passing — this resolves both Task 8's deferred tests and the new Task 9 tests.

- [ ] **Step 6: Commit (bundles Task 8 changes too)**

```bash
git add routes/scenarios.js routes/sessions.js server.js test/scenariosRoute.test.js test/sessionsRoute.test.js
git commit -m "feat(routes,server): wire tokenGuard + killSwitch into request pipeline"
```

---

## Task 10: Serve dist/ from Express + SPA fallback

**Files:**
- Modify: `server.js`

This task has no automated test (would require a real Vite build to verify). Verified by manual smoke check.

- [ ] **Step 1: Add static + SPA fallback to `createApp`**

In `server.js`, after the line `app.use('/api/sessions', createSessionsRouter({ gradingService, tokenGuard }));` and before `return app;`, add:

```js
  const path = require('path');
  const fs = require('fs');
  const distDir = path.join(__dirname, 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }
  app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));
```

The `fs.existsSync` guard means local dev (where `dist/` doesn't exist) keeps working through the Vite dev server unchanged.

- [ ] **Step 2: Verify local dev still works**

Run: `npm run dev:all` (in a separate terminal)
Open: `http://localhost:5173/`
Expected: SelectionScreen loads, scenarios still work. Stop the dev servers (Ctrl-C).

- [ ] **Step 3: Verify production-style local build**

Run: `npm run build && PORT=3001 node server.js &` (server in background)
In a new shell: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/`
Expected: `200`.
Then: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/scenario-types`
Expected: `200`.
Then: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/session/abc`
Expected: `200` (SPA fallback returns index.html).
Then: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/nonsense`
Expected: `404` (api 404 handler caught it, didn't fall through to SPA).

Stop the server: `kill %1` (or find the PID with `lsof -i :3001`).

- [ ] **Step 4: Run tests; confirm none broken**

Run: `npm test 2>&1 | tail -3`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat(server): serve built React app with SPA fallback"
```

---

## Task 11: Cold-start notice on SelectionScreen

**Files:**
- Modify: `src/pages/SelectionScreen.jsx`

- [ ] **Step 1: Read the current file to find the right insertion point**

Run: `head -40 src/pages/SelectionScreen.jsx`
Locate the top of the rendered JSX (typically the outermost wrapper after the component function header).

- [ ] **Step 2: Add a one-line notice**

Insert this immediately inside the outermost JSX wrapper (before the existing tabs/content):

```jsx
<p className="text-xs text-muted-foreground mt-2 mb-4">
  First click after a quiet period may take ~30 seconds while the server wakes up — this is normal.
</p>
```

- [ ] **Step 3: Verify in dev**

Run `npm run dev:all`, visit `http://localhost:5173/`, confirm the notice renders above the tabs. Stop the dev servers.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SelectionScreen.jsx
git commit -m "feat(ui): add cold-start notice to SelectionScreen"
```

---

## Task 12: Create render.yaml

**Files:**
- Create: `render.yaml`

- [ ] **Step 1: Create the file**

```yaml
services:
  - type: web
    name: emt-trainer
    runtime: node
    plan: free
    region: oregon
    buildCommand: npm ci && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: OPENAI_API_KEY
        sync: false
      - key: SERVICE_DISABLED
        value: "false"
      - key: DAILY_TOKEN_BUDGET
        value: "200000"
```

`sync: false` on `OPENAI_API_KEY` tells Render to NOT auto-sync the value from the file (which is committed) — you set it manually in the dashboard. The other env vars have safe defaults that can be overridden in the dashboard.

- [ ] **Step 2: Commit**

```bash
git add render.yaml
git commit -m "feat: add render.yaml for IaC deploys"
```

---

## Task 13: Update CLAUDE.md with deployment section

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Append a Deployment section**

At the very end of `CLAUDE.md`, add:

```markdown
## Deployment (Render free tier)

The app deploys as a single Render Web Service that serves both `/api/*` and the built React app from one origin. Configuration lives in `render.yaml`.

### One-time setup

1. **Cap OpenAI spend.** In your OpenAI billing dashboard, set a hard monthly usage limit (suggested: $25). This is the ultimate budget backstop.
2. **Push to a Git remote.** Create a GitHub (or GitLab/Bitbucket) repo, then `git remote add origin <url> && git push -u origin main`.
3. **Connect Render.** Sign in at render.com → New → Blueprint → connect the repo → Render reads `render.yaml` and creates the service.
4. **Set the OpenAI key** in Render → service → Environment → add `OPENAI_API_KEY` with your real key.
5. **First deploy** runs automatically. Visit the `*.onrender.com` URL Render assigns.

### Operating

- **Logs:** Render dashboard → service → Logs (tail in real time).
- **Kill switch:** set `SERVICE_DISABLED=true` in Environment + redeploy. All `/api/*` returns 503 within ~90s.
- **Adjust daily budget:** change `DAILY_TOKEN_BUDGET` in Environment + redeploy.
- **Cold starts:** free tier sleeps after 15 min idle; first request after sleep takes ~30s. Upgrade to starter ($7/mo) to eliminate.

### Upgrade path

Render dashboard → service → Settings → Plan → Starter. No code changes. For SQLite continuity across redeploys, also add a persistent disk ($1/mo) and set `DB_PATH` to a path on the disk (small `databaseManager` change required at that time).
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document Render deployment in CLAUDE.md"
```

---

## Task 14: Manual deployment to Render

This task is mostly external actions. No code changes, no tests. Each step is a single action.

- [ ] **Step 1: Set OpenAI hard cap**

Go to https://platform.openai.com/account/billing/limits → set a monthly hard limit (suggested: $25). Save.

- [ ] **Step 2: Create GitHub repo**

Run on your machine:

```bash
gh repo create emt-scenario-trainer --public --source=. --remote=origin --push
```

(If you don't have `gh` CLI: create the repo manually via github.com, then `git remote add origin <url> && git push -u origin main`.)

Expected: confirmation that the repo is public and `main` is pushed.

- [ ] **Step 3: Create the Render service**

Go to https://render.com → sign up/in → **New** → **Blueprint** → connect the GitHub repo → Render reads `render.yaml` → click **Apply**.

Expected: service `emt-trainer` listed as "Building".

- [ ] **Step 4: Set OPENAI_API_KEY in Render**

In the Render dashboard for the new service: **Environment** → **Add Environment Variable** → key `OPENAI_API_KEY`, value = your real key. Save.

This triggers a redeploy automatically.

- [ ] **Step 5: Wait for first deploy**

Watch the Logs tab. Expect:
- `npm ci` output
- `npm run build` (vite build)
- `npm start` → `[server] listening on :<port>`

Total: ~3–5 min.

- [ ] **Step 6: Smoke test the URL**

Open the `*.onrender.com` URL Render shows. Verify:
1. SelectionScreen loads with the cold-start notice.
2. Pick a Trauma → MVC scenario; wait for generation; runner loads with patient + environment + chat box.
3. Send a chat message; confirm a reply appears.
4. Click **End Scenario & Grade**; confirm the feedback page loads with rubric scores.

- [ ] **Step 7: Verify the kill switch**

Set `SERVICE_DISABLED=true` in Render → Environment → Save. Wait ~90s for redeploy.

Run from your terminal:

```bash
curl -s https://<your-name>.onrender.com/api/scenario-types
```

Expected: `{"error":"service temporarily disabled"}` with HTTP 503.

Set `SERVICE_DISABLED=false` and wait for redeploy before continuing.

- [ ] **Step 8: Verify the daily token meter**

Set `DAILY_TOKEN_BUDGET=100` in Render → Environment → Save. Wait ~90s.

Open the URL, generate a scenario (this consumes well over 100 tokens). Then send a chat message. Expected: 503 on the chat call with `daily token quota reached` once tokens cross 100.

Set `DAILY_TOKEN_BUDGET=200000` (or your chosen production cap) and redeploy.

- [ ] **Step 9: Share the URL with students**

Done. The URL is the deployment.

---

## Self-review (run before handoff)

Spec coverage:
- §Architecture → Tasks 9, 10 (server.js + routers)
- §Code changes required → Tasks 1, 7, 8, 9, 10, 11, 12, 13
- §Abuse mitigation → Tasks 2, 3, 4, 5, 6, 9, 14 (Step 1 manual cap, Steps 7–8 verification)
- §Operational details → Tasks 11, 13, 14
- §Acceptance criteria → all six covered: criterion 1 (Step 6), 2 (Step 6), 3 (Step 7), 4 (Step 8), 5 (each TDD task ends with `npm test`), 6 (Task 13)

Type/signature consistency:
- `tokenGuard` is the *middleware function*; `tokenMeter` is the *meter object* — never mixed.
- All factories accept `tokenMeter` (object); all routers accept `tokenGuard` (function).
- `recordUsage(promptTokens, completionTokens)` signature is identical across all three services.

No placeholders. Every code block is complete (the one explicit "keep existing" instruction is in Task 8 Step 3 about the long systemMsg array, which is unchanged from the current file and would be wasteful to re-paste).
