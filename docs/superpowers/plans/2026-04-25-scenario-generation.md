# Scenario Generation + shadcn UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`).

**Goal:** Add scenario selection + generation, and replace the hand-rolled CSS with Tailwind v4 + shadcn/ui primitives.

**Architecture:** Static catalog → templateGenerator → OpenAI (JSON mode) → scenario stored in `sessions.state`. SelectionScreen kicks off a scenario; ScenarioRunner shows it and hands off to the existing chat endpoint (system message seeded so chat is on-topic).

**Tech additions:** tailwindcss v4, @tailwindcss/vite, class-variance-authority, clsx, tailwind-merge, lucide-react, @radix-ui primitives (tabs, scroll-area, separator).

**Reference spec:** `docs/superpowers/specs/2026-04-25-scenario-generation-design.md`

---

## Task A: Tailwind v4 + shadcn deps

**Files:** `package.json`, `vite.config.js`, `src/index.css`, `tailwind.config.js`, `jsconfig.json`, `components.json`, `src/lib/utils.js`

- [ ] **A1: Install deps**

```bash
npm install tailwindcss@4 @tailwindcss/vite class-variance-authority clsx tailwind-merge lucide-react \
            @radix-ui/react-tabs @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-slot
```

- [ ] **A2: Update `vite.config.js` with tailwind plugin + path alias**

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
```

- [ ] **A3: Replace `src/index.css` with Tailwind + shadcn css vars**

```css
@import "tailwindcss";

@theme {
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.145 0 0);
  --color-card: oklch(1 0 0);
  --color-card-foreground: oklch(0.145 0 0);
  --color-primary: oklch(0.205 0 0);
  --color-primary-foreground: oklch(0.985 0 0);
  --color-secondary: oklch(0.97 0 0);
  --color-secondary-foreground: oklch(0.205 0 0);
  --color-muted: oklch(0.97 0 0);
  --color-muted-foreground: oklch(0.556 0 0);
  --color-accent: oklch(0.97 0 0);
  --color-accent-foreground: oklch(0.205 0 0);
  --color-destructive: oklch(0.577 0.245 27.325);
  --color-border: oklch(0.922 0 0);
  --color-input: oklch(0.922 0 0);
  --color-ring: oklch(0.708 0 0);
  --radius: 0.625rem;
}

body { @apply bg-background text-foreground antialiased; }
```

- [ ] **A4: Create `src/lib/utils.js`**

```javascript
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
```

- [ ] **A5: `jsconfig.json` for editor**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

- [ ] **A6: `components.json` (shadcn marker)**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": false,
  "tailwind": { "config": "", "css": "src/index.css", "baseColor": "neutral", "cssVariables": true },
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui" }
}
```

- [ ] **A7: Build sanity check**

Run: `npm run build`
Expected: builds without error.

- [ ] **A8: Commit**

```bash
git add package.json package-lock.json vite.config.js src/index.css src/lib jsconfig.json components.json
git -c user.email=dev@local -c user.name=dev commit -m "feat(ui): tailwind v4 + shadcn foundation"
```

---

## Task B: shadcn primitives (button, card, input, badge, tabs, scroll-area, separator, skeleton)

**Files:** `src/components/ui/{button,card,input,badge,tabs,scroll-area,separator,skeleton}.jsx`

These are written by hand using the canonical shadcn implementations adapted for JSX.

- [ ] **B1-B8:** Create each file with the exact contents in the appendix at the bottom of this plan.

- [ ] **B9: Build sanity check**

Run: `npm run build`
Expected: success.

- [ ] **B10: Commit**

```bash
git add src/components/ui
git -c user.email=dev@local -c user.name=dev commit -m "feat(ui): shadcn primitives"
```

---

## Task C: Migrate Header + TestConnection

**Files:** Move `src/Header.jsx` → `src/components/Header.jsx`; move `src/TestConnection.jsx` → `src/pages/TestConnection.jsx`; update imports in `App.jsx`.

- [ ] **C1: New Header**

```jsx
// src/components/Header.jsx
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export default function Header() {
  return (
    <>
      <header className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-tight">EMT Scenario Trainer</span>
          <Badge variant="secondary">rebuild</Badge>
        </div>
        <span className="text-xs text-muted-foreground">faithful rebuild · phase 2</span>
      </header>
      <Separator />
    </>
  );
}
```

- [ ] **C2: Restyle TestConnection at `src/pages/TestConnection.jsx`**

```jsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export default function TestConnection() {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      });
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const data = await res.json();
      setSessionId(data.sessionId);
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardContent className="p-4">
        <ScrollArea className="h-[60vh] pr-2">
          <div className="flex flex-col gap-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-lg px-3 py-2 max-w-[80%] whitespace-pre-wrap text-sm',
                  m.role === 'user'
                    ? 'self-end bg-primary text-primary-foreground'
                    : 'self-start bg-muted'
                )}
              >
                {m.content}
              </div>
            ))}
          </div>
        </ScrollArea>
        <form className="flex gap-2 mt-4" onSubmit={send}>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !input.trim()}>
            {busy ? 'Sending…' : 'Send'}
          </Button>
        </form>
        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **C3: Delete the old files**

```bash
rm src/Header.jsx src/TestConnection.jsx
```

- [ ] **C4: Update `src/App.jsx`**

```jsx
import { Routes, Route } from 'react-router-dom';
import Header from '@/components/Header';
import SelectionScreen from '@/pages/SelectionScreen';
import ScenarioRunner from '@/pages/ScenarioRunner';
import TestConnection from '@/pages/TestConnection';

export default function App() {
  return (
    <div className="max-w-3xl mx-auto px-4">
      <Header />
      <Routes>
        <Route path="/" element={<SelectionScreen />} />
        <Route path="/session/:id" element={<ScenarioRunner />} />
        <Route path="/test" element={<TestConnection />} />
      </Routes>
    </div>
  );
}
```

- [ ] **C5: Commit (build will fail until D, E pages exist — defer build check to Task F)**

```bash
git add src/components/Header.jsx src/pages/TestConnection.jsx src/App.jsx
git rm src/Header.jsx src/TestConnection.jsx
git -c user.email=dev@local -c user.name=dev commit -m "refactor(ui): move components to shadcn structure"
```

---

## Task D: Backend — scenario types + template + generator

**Files:** `services/scenarioTypes.js`, `services/templateGenerator.js`, `services/scenarioGenerator.js`, `test/scenarioGenerator.test.js`

- [ ] **D1: Catalog `services/scenarioTypes.js`**

```javascript
const CATALOG = Object.freeze({
  trauma:  ['MVC','Fall','Assault','Sport Injury','Stabbing','GSW','Burn'],
  medical: ['Cardiac','Respiratory','Neurological','Metabolic','Obstetric','Pediatric'],
});

function isValid(type, subtype) {
  return Array.isArray(CATALOG[type]) && CATALOG[type].includes(subtype);
}

module.exports = { CATALOG, isValid };
```

- [ ] **D2: Template `services/templateGenerator.js`**

```javascript
const HINTS = {
  MVC: 'high-speed two-vehicle collision; consider mechanism of injury, c-spine, internal bleeding',
  Fall: 'fall from height; spine and head injury risk',
  Assault: 'blunt or penetrating; document scene safety',
  'Sport Injury': 'orthopedic focus; possible concussion',
  Stabbing: 'penetrating trauma; bleeding control critical',
  GSW: 'gunshot wound; scene safety, primary survey, hemorrhage control',
  Burn: 'thermal/chemical burn; rule of nines, airway concern',
  Cardiac: 'chest pain or arrhythmia; OPQRST',
  Respiratory: 'dyspnea, COPD/asthma/anaphylaxis differentials',
  Neurological: 'stroke or seizure; FAST exam, GCS',
  Metabolic: 'diabetic, electrolyte, overdose',
  Obstetric: 'pregnant patient or imminent delivery',
  Pediatric: 'age-appropriate vitals; consider non-accidental trauma',
};

function getTemplate(type, subtype) {
  const hint = HINTS[subtype] || '';
  return `Scenario type: ${type}. Subtype: ${subtype}. Clinical hints: ${hint}.`;
}

module.exports = { getTemplate };
```

- [ ] **D3: Failing test `test/scenarioGenerator.test.js`**

```javascript
const assert = require('assert');
const { makeScenarioGenerator } = require('../services/scenarioGenerator');

function fakeOpenAI(jsonStr) {
  return {
    chat: { completions: {
      create: async () => ({ choices: [{ message: { content: jsonStr } }] }),
    }},
  };
}

const validJson = JSON.stringify({
  type: 'trauma',
  subtype: 'MVC',
  dispatch: '34yo M MVC on Hwy 101',
  patientProfile: { name: 'John', age: 34, sex: 'male', chiefComplaint: 'chest pain', vitals: { hr: 110, bp: '140/90', rr: 22, spo2: 95, gcs: 15 } },
  environment: { location: 'highway shoulder', weather: 'clear', lighting: 'daylight', hazards: ['traffic'] },
  expectedAssessment: 'trauma',
});

exports.tests = [
  {
    name: 'generate returns parsed scenario',
    fn: async () => {
      const gen = makeScenarioGenerator({ openai: fakeOpenAI(validJson) });
      const s = await gen.generate('trauma', 'MVC');
      assert.strictEqual(s.type, 'trauma');
      assert.strictEqual(s.subtype, 'MVC');
      assert.strictEqual(s.patientProfile.age, 34);
    },
  },
  {
    name: 'generate rejects unknown type',
    fn: async () => {
      const gen = makeScenarioGenerator({ openai: fakeOpenAI(validJson) });
      await assert.rejects(() => gen.generate('alien', 'MVC'), /invalid/i);
    },
  },
  {
    name: 'generate rejects malformed JSON from openai',
    fn: async () => {
      const gen = makeScenarioGenerator({ openai: fakeOpenAI('not json') });
      await assert.rejects(() => gen.generate('trauma', 'MVC'));
    },
  },
];
```

- [ ] **D4: Run, see fail; implement `services/scenarioGenerator.js`**

```javascript
const { isValid } = require('./scenarioTypes');
const { getTemplate } = require('./templateGenerator');

const DEFAULT_MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `You generate realistic EMT training scenarios as STRICT JSON. Schema:
{
  "type": "trauma|medical",
  "subtype": "string",
  "dispatch": "1-2 sentence radio-style dispatch",
  "patientProfile": { "name": "string", "age": number, "sex": "male|female", "chiefComplaint": "string",
    "vitals": { "hr": number, "bp": "sys/dia", "rr": number, "spo2": number, "gcs": number } },
  "environment": { "location": "string", "weather": "string", "lighting": "string", "hazards": ["string"] },
  "expectedAssessment": "trauma|medical"
}
Return ONLY the JSON object. No prose.`;

function makeScenarioGenerator({ openai, model = DEFAULT_MODEL }) {
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
    const raw = completion.choices[0].message.content;
    const parsed = JSON.parse(raw);
    if (!parsed.patientProfile || !parsed.environment) throw new Error('scenario missing required fields');
    return parsed;
  }
  return { generate };
}

module.exports = { makeScenarioGenerator };
```

- [ ] **D5: `npm test` — expect 12 passing.**

- [ ] **D6: Commit**

```bash
git add services/ test/scenarioGenerator.test.js
git -c user.email=dev@local -c user.name=dev commit -m "feat(scenario): catalog, template, generator with tests"
```

---

## Task E: sessionManager.setScenario + scenarios route

**Files:** `services/sessionManager.js` (add `setScenario`), `routes/scenarios.js`, `server.js` (mount), `test/scenariosRoute.test.js`

- [ ] **E1: Extend sessionManager — append to existing module**

Edit `services/sessionManager.js` to add and export:

```javascript
function setScenario(sessionId, scenarioType, stateJson) {
  getDb()
    .prepare('UPDATE sessions SET scenario_type = ?, state = ? WHERE id = ?')
    .run(scenarioType, stateJson, sessionId);
}
```

Update `module.exports` to include `setScenario`.

- [ ] **E2: Failing test `test/scenariosRoute.test.js`**

```javascript
const assert = require('assert');
const request = require('supertest');
const { resetForTests, getDb } = require('../database/databaseManager');
const { createApp } = require('../server');
const sm = require('../services/sessionManager');

function setup() { resetForTests(); getDb(':memory:'); }

const fakeScenario = {
  type: 'trauma', subtype: 'MVC', dispatch: 'd',
  patientProfile: { name: 'X', age: 30, sex: 'male', chiefComplaint: 'c', vitals: { hr: 80, bp: '120/80', rr: 16, spo2: 99, gcs: 15 } },
  environment: { location: 'l', weather: 'w', lighting: 'l', hazards: [] },
  expectedAssessment: 'trauma',
};

function fakeChatService() {
  return { handleMessage: async () => ({ sessionId: 'x', reply: 'x' }) };
}

function fakeScenarioGen() {
  return { generate: async () => fakeScenario };
}

exports.tests = [
  {
    name: 'GET /api/scenario-types returns the catalog',
    fn: async () => {
      setup();
      const app = createApp({ chatService: fakeChatService(), scenarioGenerator: fakeScenarioGen() });
      const res = await request(app).get('/api/scenario-types');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.trauma.includes('MVC'));
      assert.ok(res.body.medical.includes('Cardiac'));
    },
  },
  {
    name: 'POST /api/scenarios creates session, persists scenario, seeds system message',
    fn: async () => {
      setup();
      const app = createApp({ chatService: fakeChatService(), scenarioGenerator: fakeScenarioGen() });
      const res = await request(app).post('/api/scenarios').send({ type: 'trauma', subtype: 'MVC' });
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.sessionId);
      assert.strictEqual(res.body.scenario.subtype, 'MVC');
      const row = sm.getSession(res.body.sessionId);
      assert.strictEqual(row.scenario_type, 'trauma');
      assert.ok(row.state && JSON.parse(row.state).subtype === 'MVC');
      const history = sm.getHistory(res.body.sessionId);
      assert.strictEqual(history[0].role, 'system');
    },
  },
  {
    name: 'POST /api/scenarios rejects invalid subtype',
    fn: async () => {
      setup();
      const app = createApp({ chatService: fakeChatService(), scenarioGenerator: fakeScenarioGen() });
      const res = await request(app).post('/api/scenarios').send({ type: 'trauma', subtype: 'Nope' });
      assert.strictEqual(res.status, 400);
    },
  },
];
```

- [ ] **E3: Implement `routes/scenarios.js`**

```javascript
const express = require('express');
const { CATALOG, isValid } = require('../services/scenarioTypes');
const sm = require('../services/sessionManager');

function createScenarioRouter(scenarioGenerator) {
  const router = express.Router();

  router.get('/scenario-types', (_req, res) => res.json(CATALOG));

  router.post('/scenarios', async (req, res) => {
    const { type, subtype } = req.body || {};
    if (!isValid(type, subtype)) {
      return res.status(400).json({ error: 'invalid type or subtype' });
    }
    try {
      const scenario = await scenarioGenerator.generate(type, subtype);
      const sessionId = sm.createSession();
      sm.setScenario(sessionId, type, JSON.stringify(scenario));
      const systemMsg = `You are simulating an EMT training scenario. Stay strictly in character as the patient and bystanders. Scenario JSON:\n${JSON.stringify(scenario)}`;
      sm.appendMessage(sessionId, 'system', systemMsg);
      res.json({ sessionId, scenario });
    } catch (err) {
      console.error('[scenarios] error:', err);
      res.status(500).json({ error: 'scenario generation failed' });
    }
  });

  return router;
}

module.exports = { createScenarioRouter };
```

- [ ] **E4: Update `server.js`**

Replace the `createApp` body and `start` to wire scenario generator:

```javascript
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createChatRouter } = require('./routes/chat');
const { createScenarioRouter } = require('./routes/scenarios');

function createApp({ chatService, scenarioGenerator }) {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/', rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/chat', createChatRouter(chatService));
  app.use('/api', createScenarioRouter(scenarioGenerator));
  return app;
}

function start() {
  const openai = require('./config/openai');
  const { makeChatService } = require('./services/chatService');
  const { makeScenarioGenerator } = require('./services/scenarioGenerator');
  const chatService = makeChatService({ openai });
  const scenarioGenerator = makeScenarioGenerator({ openai });
  const app = createApp({ chatService, scenarioGenerator });
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`[server] listening on :${port}`));
}

if (require.main === module) start();

module.exports = { createApp, start };
```

- [ ] **E5: Run `npm test` — expect 15 passing.**

- [ ] **E6: Commit**

```bash
git add services/sessionManager.js routes/scenarios.js server.js test/scenariosRoute.test.js
git -c user.email=dev@local -c user.name=dev commit -m "feat(scenario): /api/scenarios route and session wiring"
```

---

## Task F: Frontend pages — SelectionScreen + ScenarioRunner

**Files:** `src/pages/SelectionScreen.jsx`, `src/pages/ScenarioRunner.jsx`

- [ ] **F1: `src/pages/SelectionScreen.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';

export default function SelectionScreen() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState(null);
  const [busy, setBusy] = useState(null); // subtype currently loading
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/scenario-types').then(r => r.json()).then(setCatalog).catch(e => setError(e.message));
  }, []);

  async function start(type, subtype) {
    setBusy(subtype); setError(null);
    try {
      const res = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, subtype }),
      });
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const data = await res.json();
      sessionStorage.setItem(`scenario:${data.sessionId}`, JSON.stringify(data.scenario));
      navigate(`/session/${data.sessionId}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!catalog) return (
    <div className="grid grid-cols-2 gap-3 mt-6">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
    </div>
  );

  return (
    <div className="mt-6">
      <h1 className="text-2xl font-semibold tracking-tight">Choose a scenario</h1>
      <p className="text-sm text-muted-foreground mb-4">Pick a category, then a subtype to begin.</p>
      <Tabs defaultValue="trauma">
        <TabsList>
          <TabsTrigger value="trauma">Trauma</TabsTrigger>
          <TabsTrigger value="medical">Medical</TabsTrigger>
        </TabsList>
        {['trauma','medical'].map((type) => (
          <TabsContent key={type} value={type}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              {catalog[type].map((subtype) => (
                <Card
                  key={subtype}
                  onClick={() => !busy && start(type, subtype)}
                  className={`cursor-pointer hover:border-primary transition ${busy === subtype ? 'opacity-60' : ''}`}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      {subtype}
                      {busy === subtype && <Loader2 className="h-4 w-4 animate-spin" />}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground capitalize">{type}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
      {error && <p className="text-sm text-destructive mt-3">{error}</p>}
    </div>
  );
}
```

- [ ] **F2: `src/pages/ScenarioRunner.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

function VitalsRow({ vitals }) {
  return (
    <div className="grid grid-cols-5 gap-2 text-xs">
      {Object.entries(vitals).map(([k, v]) => (
        <div key={k} className="rounded-md border p-2">
          <div className="text-muted-foreground uppercase text-[10px]">{k}</div>
          <div className="font-mono font-semibold">{v}</div>
        </div>
      ))}
    </div>
  );
}

export default function ScenarioRunner() {
  const { id } = useParams();
  const [scenario, setScenario] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const cached = sessionStorage.getItem(`scenario:${id}`);
    if (cached) setScenario(JSON.parse(cached));
  }, [id]);

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id, message: text }),
      });
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const data = await res.json();
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!scenario) {
    return (
      <div className="mt-6">
        <p className="text-sm text-muted-foreground">No scenario data found for this session. <Link className="underline" to="/">Start a new scenario</Link>.</p>
      </div>
    );
  }

  const p = scenario.patientProfile;
  const env = scenario.environment;

  return (
    <div className="mt-6 grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Dispatch</span>
            <Badge variant="secondary">{scenario.type} · {scenario.subtype}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{scenario.dispatch}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Patient</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm"><span className="font-medium">{p.name}</span> · {p.age}y · {p.sex}</div>
            <div className="text-sm text-muted-foreground">CC: {p.chiefComplaint}</div>
            <Separator />
            <VitalsRow vitals={p.vitals} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Environment</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div><span className="text-muted-foreground">Location:</span> {env.location}</div>
            <div><span className="text-muted-foreground">Weather:</span> {env.weather}</div>
            <div><span className="text-muted-foreground">Lighting:</span> {env.lighting}</div>
            <div><span className="text-muted-foreground">Hazards:</span> {env.hazards.join(', ') || 'none'}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <ScrollArea className="h-[45vh] pr-2">
            <div className="flex flex-col gap-2">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">Begin your assessment. Ask the patient or dispatch crew anything.</p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-lg px-3 py-2 max-w-[80%] whitespace-pre-wrap text-sm',
                    m.role === 'user'
                      ? 'self-end bg-primary text-primary-foreground'
                      : 'self-start bg-muted'
                  )}
                >
                  {m.content}
                </div>
              ))}
            </div>
          </ScrollArea>
          <form className="flex gap-2 mt-4" onSubmit={send}>
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask the patient or describe an action…" disabled={busy} />
            <Button type="submit" disabled={busy || !input.trim()}>{busy ? 'Sending…' : 'Send'}</Button>
          </form>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **F3: Build sanity check**

Run: `npm run build`
Expected: success.

- [ ] **F4: Commit**

```bash
git add src/pages
git -c user.email=dev@local -c user.name=dev commit -m "feat(ui): SelectionScreen + ScenarioRunner pages"
```

---

## Task G: Smoke

- [ ] **G1: Start `npm run dev:all`**
- [ ] **G2: Visit `/`, pick Trauma → MVC → land on `/session/:id` with dispatch + patient + env.**
- [ ] **G3: Send a chat message; assistant reply stays on-scenario.**
- [ ] **G4: Visit `/test` to verify the bare smoke chat still works.**

---

## Appendix — shadcn primitive sources

(Hand-written to match shadcn New York style; copy into `src/components/ui/` as JSX.)

### `button.jsx`

```jsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
      },
      size: { default: 'h-9 px-4 py-2', sm: 'h-8 px-3', lg: 'h-10 px-6', icon: 'h-9 w-9' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
```

### `card.jsx`

```jsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)} {...props} />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col space-y-1.5 p-4', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-4 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

export { Card, CardHeader, CardTitle, CardContent };
```

### `input.jsx`

```jsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
```

### `badge.jsx`

```jsx
import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
```

### `tabs.jsx`

```jsx
import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground', className)}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-2 ring-offset-background focus-visible:outline-none', className)} {...props} />
));
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
```

### `scroll-area.jsx`

```jsx
import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/lib/utils';

const ScrollArea = React.forwardRef(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn('relative overflow-hidden', className)} {...props}>
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollAreaPrimitive.Scrollbar orientation="vertical" className="flex touch-none select-none p-0.5 transition-colors duration-150 ease-out hover:bg-accent">
      <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border" />
    </ScrollAreaPrimitive.Scrollbar>
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };
```

### `separator.jsx`

```jsx
import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';

const Separator = React.forwardRef(
  ({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
      {...props}
    />
  )
);
Separator.displayName = 'Separator';

export { Separator };
```

### `skeleton.jsx`

```jsx
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

export { Skeleton };
```
