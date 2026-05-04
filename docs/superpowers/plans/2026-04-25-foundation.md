# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the walking skeleton of the EMT Scenario Trainer rebuild — Express + SQLite + OpenAI backend, React + Vite frontend, end-to-end chat round-trip with passing tests.

**Architecture:** Express server on `:3000` with `routes/chat.js → services/chatService.js → {sessionManager, openai}`. SQLite via `better-sqlite3` for sessions/messages. React 19 + Vite frontend on `:5173` proxies `/api` to backend. Custom test runner (no jest in this phase). One responsibility per file; only `sessionManager` touches the DB and only `chatService` touches OpenAI.

**Tech Stack:** Node.js 18+, Express 4, better-sqlite3 12, OpenAI SDK 5, React 19, Vite 6, helmet, cors, express-rate-limit, dotenv, nodemon, concurrently.

**Reference spec:** `docs/superpowers/specs/2026-04-25-foundation-design.md`

---

## Task 0: Project Bootstrap

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `package.json`
- Create: `README.md`

- [ ] **Step 1: Initialize git**

```bash
cd /Users/yogeshseenichamy/Documents/coding/ArinEMTProject
git init
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
dist/
.env
database/emt.db
database/emt.db-journal
.DS_Store
```

- [ ] **Step 3: Write `.env.example`**

```
# Required: OpenAI API key for chat
# Get one at https://platform.openai.com/api-keys
OPENAI_API_KEY=your_openai_api_key_here

# Optional: Server port (default 3000)
# PORT=3000
```

- [ ] **Step 4: Write `package.json`**

```json
{
  "name": "emt-scenario-trainer",
  "private": true,
  "version": "0.0.0",
  "type": "commonjs",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "dev:backend": "nodemon server.js",
    "dev:frontend": "vite",
    "dev:all": "concurrently -k -n backend,frontend \"nodemon server.js\" \"vite\"",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "test": "node test/test-runner.js"
  },
  "dependencies": {
    "better-sqlite3": "^12.6.2",
    "cors": "^2.8.5",
    "dotenv": "^17.2.1",
    "express": "^4.18.2",
    "express-rate-limit": "^8.0.1",
    "helmet": "^8.1.0",
    "openai": "^5.11.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^7.8.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.25.0",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "@vitejs/plugin-react": "^4.4.1",
    "concurrently": "^9.2.0",
    "eslint": "^9.25.0",
    "eslint-plugin-react-hooks": "^5.2.0",
    "eslint-plugin-react-refresh": "^0.4.19",
    "globals": "^16.0.0",
    "nodemon": "^3.1.10",
    "supertest": "^7.0.0",
    "vite": "^6.3.5"
  }
}
```

Note: React frontend uses ESM via Vite; backend uses CommonJS (`"type": "commonjs"`). `supertest` is added for the chat-route smoke test.

- [ ] **Step 5: Write minimal `README.md`**

```markdown
# EMT Scenario Trainer

Faithful rebuild. See `CLAUDE.md` for product context and `docs/superpowers/specs/` for sub-project specs.

## Quick start

    cp .env.example .env       # then put your OPENAI_API_KEY in .env
    npm install
    npm run dev:all            # backend :3000, frontend :5173
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: completes with no errors. `node_modules/` populated.

- [ ] **Step 7: Commit**

```bash
git add .gitignore .env.example package.json package-lock.json README.md
git commit -m "chore: bootstrap project (deps, scripts, env example)"
```

---

## Task 1: Database Schema + Manager

**Files:**
- Create: `database/schema.sql`
- Create: `database/databaseManager.js`

- [ ] **Step 1: Write `database/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  scenario_type TEXT,
  state TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system','user','assistant')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
```

- [ ] **Step 2: Write `database/databaseManager.js`**

```javascript
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let dbInstance = null;

function getDb(filename) {
  if (dbInstance) return dbInstance;
  const file = filename ?? path.join(__dirname, 'emt.db');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  dbInstance = db;
  return db;
}

function resetForTests() {
  if (dbInstance) dbInstance.close();
  dbInstance = null;
}

module.exports = { getDb, resetForTests };
```

- [ ] **Step 3: Verify schema loads**

Run: `node -e "require('./database/databaseManager').getDb(':memory:'); console.log('ok')"`
Expected: prints `ok` with no errors.

- [ ] **Step 4: Commit**

```bash
git add database/
git commit -m "feat(db): sqlite schema and manager"
```

---

## Task 2: Session Manager (TDD)

**Files:**
- Create: `services/sessionManager.js`
- Create: `test/test-runner.js`
- Create: `test/sessionManager.test.js`

- [ ] **Step 1: Write the test runner `test/test-runner.js`**

```javascript
const fs = require('fs');
const path = require('path');

const testDir = __dirname;
const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js'));

let passed = 0;
let failed = 0;
const failures = [];

(async () => {
  for (const file of files) {
    const mod = require(path.join(testDir, file));
    const tests = mod.tests || [];
    for (const t of tests) {
      try {
        await t.fn();
        passed++;
        console.log(`  ✓ ${file} :: ${t.name}`);
      } catch (err) {
        failed++;
        failures.push({ file, name: t.name, err });
        console.log(`  ✗ ${file} :: ${t.name}`);
      }
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) {
      console.log(`\n--- ${f.file} :: ${f.name} ---`);
      console.log(f.err.stack || f.err.message);
    }
    process.exit(1);
  }
})();
```

- [ ] **Step 2: Write the failing test `test/sessionManager.test.js`**

```javascript
const assert = require('assert');
const { resetForTests, getDb } = require('../database/databaseManager');
const sm = require('../services/sessionManager');

function setup() {
  resetForTests();
  getDb(':memory:');
}

exports.tests = [
  {
    name: 'createSession returns a non-empty id',
    fn: () => {
      setup();
      const id = sm.createSession();
      assert.ok(typeof id === 'string' && id.length > 0);
    },
  },
  {
    name: 'append + getHistory round-trip preserves order',
    fn: () => {
      setup();
      const id = sm.createSession();
      sm.appendMessage(id, 'user', 'hello');
      sm.appendMessage(id, 'assistant', 'hi there');
      sm.appendMessage(id, 'user', 'how are you');
      const history = sm.getHistory(id);
      assert.deepStrictEqual(history, [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
        { role: 'user', content: 'how are you' },
      ]);
    },
  },
  {
    name: 'getSession returns row for known id, null for unknown',
    fn: () => {
      setup();
      const id = sm.createSession();
      const row = sm.getSession(id);
      assert.strictEqual(row.id, id);
      assert.strictEqual(sm.getSession('nope'), null);
    },
  },
];
```

- [ ] **Step 3: Run test, confirm failure**

Run: `npm test`
Expected: FAIL — `services/sessionManager` not found.

- [ ] **Step 4: Implement `services/sessionManager.js`**

```javascript
const crypto = require('crypto');
const { getDb } = require('../database/databaseManager');

function createSession() {
  const id = crypto.randomUUID();
  getDb()
    .prepare('INSERT INTO sessions (id, created_at) VALUES (?, ?)')
    .run(id, Date.now());
  return id;
}

function getSession(id) {
  const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  return row ?? null;
}

function appendMessage(sessionId, role, content) {
  getDb()
    .prepare(
      'INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(sessionId, role, content, Date.now());
}

function getHistory(sessionId) {
  return getDb()
    .prepare(
      'SELECT role, content FROM messages WHERE session_id = ? ORDER BY id ASC'
    )
    .all(sessionId);
}

module.exports = { createSession, getSession, appendMessage, getHistory };
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npm test`
Expected: `3 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add services/sessionManager.js test/test-runner.js test/sessionManager.test.js
git commit -m "feat(session): session manager with round-trip tests"
```

---

## Task 3: OpenAI Client Wrapper

**Files:**
- Create: `config/openai.js`

- [ ] **Step 1: Write `config/openai.js`**

```javascript
const OpenAI = require('openai');

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    'OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.'
  );
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = client;
```

- [ ] **Step 2: Verify it throws without the key**

Run: `node -e "delete process.env.OPENAI_API_KEY; try { require('./config/openai'); console.log('NO THROW') } catch (e) { console.log('threw ok') }"`
Expected: prints `threw ok`.

- [ ] **Step 3: Commit**

```bash
git add config/openai.js
git commit -m "feat(config): openai client wrapper that fails fast on missing key"
```

---

## Task 4: Chat Service (TDD with mocked OpenAI)

**Files:**
- Create: `services/chatService.js`
- Create: `test/chatService.test.js`

The chat service must accept an injectable openai client so tests can stub it. Production code wires the real client; tests pass a fake.

- [ ] **Step 1: Write the failing test `test/chatService.test.js`**

```javascript
const assert = require('assert');
const { resetForTests, getDb } = require('../database/databaseManager');
const sm = require('../services/sessionManager');
const { makeChatService } = require('../services/chatService');

function setup() {
  resetForTests();
  getDb(':memory:');
}

function fakeOpenAI(reply) {
  return {
    chat: {
      completions: {
        create: async ({ messages }) => {
          fakeOpenAI.lastMessages = messages;
          return { choices: [{ message: { role: 'assistant', content: reply } }] };
        },
      },
    },
  };
}

exports.tests = [
  {
    name: 'creates a new session when sessionId is null and returns reply',
    fn: async () => {
      setup();
      const svc = makeChatService({ openai: fakeOpenAI('hello back') });
      const res = await svc.handleMessage({ sessionId: null, message: 'hi' });
      assert.ok(res.sessionId);
      assert.strictEqual(res.reply, 'hello back');
      const history = sm.getHistory(res.sessionId);
      assert.deepStrictEqual(history, [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello back' },
      ]);
    },
  },
  {
    name: 'reuses existing session and forwards full history to openai',
    fn: async () => {
      setup();
      const id = sm.createSession();
      sm.appendMessage(id, 'user', 'first');
      sm.appendMessage(id, 'assistant', 'reply 1');
      const fake = fakeOpenAI('reply 2');
      const svc = makeChatService({ openai: fake });
      const res = await svc.handleMessage({ sessionId: id, message: 'second' });
      assert.strictEqual(res.sessionId, id);
      assert.strictEqual(res.reply, 'reply 2');
      assert.deepStrictEqual(fake.chat.completions.create.lastMessages || fakeOpenAI.lastMessages, [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply 1' },
        { role: 'user', content: 'second' },
      ]);
    },
  },
  {
    name: 'throws on blank message',
    fn: async () => {
      setup();
      const svc = makeChatService({ openai: fakeOpenAI('x') });
      await assert.rejects(
        () => svc.handleMessage({ sessionId: null, message: '   ' }),
        /message/i
      );
    },
  },
];
```

- [ ] **Step 2: Run test, confirm failure**

Run: `npm test`
Expected: FAIL — `services/chatService` not found.

- [ ] **Step 3: Implement `services/chatService.js`**

```javascript
const sm = require('./sessionManager');

const DEFAULT_MODEL = 'gpt-4o-mini';

function makeChatService({ openai, model = DEFAULT_MODEL }) {
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
    const reply = completion.choices[0].message.content;
    sm.appendMessage(id, 'assistant', reply);
    return { sessionId: id, reply };
  }
  return { handleMessage };
}

module.exports = { makeChatService };
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test`
Expected: all tests pass (6 total now).

- [ ] **Step 5: Commit**

```bash
git add services/chatService.js test/chatService.test.js
git commit -m "feat(chat): chat service with injectable openai client"
```

---

## Task 5: Chat Route + Server (TDD with supertest)

**Files:**
- Create: `routes/chat.js`
- Create: `server.js`
- Create: `test/chatRoute.test.js`

The route is wired against an Express app that the test can call directly via supertest. The app factory takes the chat service as a dependency so tests can swap it.

- [ ] **Step 1: Write the failing test `test/chatRoute.test.js`**

```javascript
const assert = require('assert');
const request = require('supertest');
const { resetForTests, getDb } = require('../database/databaseManager');
const { createApp } = require('../server');

function setup() {
  resetForTests();
  getDb(':memory:');
}

function fakeChatService(reply) {
  return {
    handleMessage: async ({ sessionId, message }) => ({
      sessionId: sessionId || 'new-session-id',
      reply,
    }),
  };
}

exports.tests = [
  {
    name: 'POST /api/chat returns 200 with reply',
    fn: async () => {
      setup();
      const app = createApp({ chatService: fakeChatService('hi') });
      const res = await request(app)
        .post('/api/chat')
        .send({ sessionId: null, message: 'yo' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.reply, 'hi');
      assert.ok(res.body.sessionId);
    },
  },
  {
    name: 'POST /api/chat returns 400 when message missing',
    fn: async () => {
      setup();
      const app = createApp({ chatService: fakeChatService('hi') });
      const res = await request(app).post('/api/chat').send({});
      assert.strictEqual(res.status, 400);
    },
  },
  {
    name: 'POST /api/chat returns 500 when service throws',
    fn: async () => {
      setup();
      const app = createApp({
        chatService: { handleMessage: async () => { throw new Error('boom'); } },
      });
      const res = await request(app)
        .post('/api/chat')
        .send({ message: 'hi' });
      assert.strictEqual(res.status, 500);
    },
  },
];
```

- [ ] **Step 2: Run test, confirm failure**

Run: `npm test`
Expected: FAIL — `server` module not found.

- [ ] **Step 3: Implement `routes/chat.js`**

```javascript
const express = require('express');

function createChatRouter(chatService) {
  const router = express.Router();
  router.post('/', async (req, res) => {
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

- [ ] **Step 4: Implement `server.js`**

```javascript
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createChatRouter } = require('./routes/chat');

function createApp({ chatService }) {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(
    '/api/',
    rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false })
  );
  app.use('/api/chat', createChatRouter(chatService));
  return app;
}

function start() {
  const openai = require('./config/openai');
  const { makeChatService } = require('./services/chatService');
  const chatService = makeChatService({ openai });
  const app = createApp({ chatService });
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`[server] listening on :${port}`));
}

if (require.main === module) start();

module.exports = { createApp, start };
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npm test`
Expected: all tests pass (9 total).

- [ ] **Step 6: Commit**

```bash
git add routes/chat.js server.js test/chatRoute.test.js
git commit -m "feat(server): express app + /api/chat route"
```

---

## Task 6: Vite + React Shell

**Files:**
- Create: `index.html`
- Create: `vite.config.js`
- Create: `src/main.jsx`
- Create: `src/App.jsx`
- Create: `src/Header.jsx`
- Create: `src/index.css`

- [ ] **Step 1: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EMT Scenario Trainer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `vite.config.js`**

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
```

- [ ] **Step 3: Write `src/index.css`**

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #f7f7f8; color: #111; }
.app { max-width: 720px; margin: 0 auto; padding: 24px; }
.header { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #ddd; margin-bottom: 16px; }
.chat { display: flex; flex-direction: column; gap: 8px; }
.msg { padding: 10px 12px; border-radius: 8px; max-width: 80%; white-space: pre-wrap; }
.msg.user { align-self: flex-end; background: #2b6cb0; color: white; }
.msg.assistant { align-self: flex-start; background: #fff; border: 1px solid #ddd; }
.composer { display: flex; gap: 8px; margin-top: 16px; }
.composer input { flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; }
.composer button { padding: 10px 16px; border: 0; border-radius: 6px; background: #2b6cb0; color: white; cursor: pointer; }
.composer button:disabled { opacity: 0.5; cursor: not-allowed; }
.error { color: #b00020; margin-top: 8px; }
```

- [ ] **Step 4: Write `src/main.jsx`**

```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 5: Write `src/Header.jsx`**

```jsx
export default function Header() {
  return (
    <header className="header">
      <strong>EMT Scenario Trainer</strong>
      <span style={{ fontSize: 12, color: '#666' }}>foundation walking skeleton</span>
    </header>
  );
}
```

- [ ] **Step 6: Write `src/App.jsx`**

```jsx
import { Routes, Route } from 'react-router-dom';
import Header from './Header.jsx';
import TestConnection from './TestConnection.jsx';

export default function App() {
  return (
    <div className="app">
      <Header />
      <Routes>
        <Route path="/" element={<TestConnection />} />
      </Routes>
    </div>
  );
}
```

Note: `TestConnection` is created in Task 7. The build will fail until then — that's fine; we commit the shell now and add the page next.

- [ ] **Step 7: Commit**

```bash
git add index.html vite.config.js src/main.jsx src/App.jsx src/Header.jsx src/index.css
git commit -m "feat(ui): vite + react shell with router and styles"
```

---

## Task 7: TestConnection Chat Page

**Files:**
- Create: `src/TestConnection.jsx`

- [ ] **Step 1: Write `src/TestConnection.jsx`**

```jsx
import { useState } from 'react';

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
    <div>
      <div className="chat">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>{m.content}</div>
        ))}
      </div>
      <form className="composer" onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify the frontend builds**

Run: `npm run build`
Expected: vite outputs `dist/` with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/TestConnection.jsx
git commit -m "feat(ui): TestConnection chat page hitting /api/chat"
```

---

## Task 8: ESLint Config

**Files:**
- Create: `eslint.config.js`

- [ ] **Step 1: Write `eslint.config.js`**

```javascript
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaVersion: 'latest', ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no errors (warnings tolerated).

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore: eslint flat config"
```

---

## Task 9: End-to-End Smoke (manual)

This task verifies the full stack. It requires a real `OPENAI_API_KEY` in `.env`. If the key is not yet provided, mark this task blocked and stop here.

- [ ] **Step 1: Confirm `.env` exists with a real key**

Run: `test -f .env && grep -q '^OPENAI_API_KEY=sk' .env && echo ok`
Expected: prints `ok`. If not, stop and request the key from the user.

- [ ] **Step 2: Start both servers**

Run: `npm run dev:all`
Expected: backend logs `[server] listening on :3000`; vite logs `Local: http://localhost:5173/`.

- [ ] **Step 3: Open the UI**

Visit `http://localhost:5173`. Type "hello" and send.
Expected: assistant reply appears within a few seconds; no errors in either log.

- [ ] **Step 4: Verify persistence**

Run (in a new terminal): `sqlite3 database/emt.db 'SELECT role, content FROM messages ORDER BY id;'`
Expected: shows both the user message and the assistant reply.

- [ ] **Step 5: Stop servers (Ctrl-C) and commit any small fixes if needed**

```bash
git status
# if there were any necessary tweaks, commit them now
```

---

## Acceptance (mirrors spec)

- [ ] `npm install` clean.
- [ ] `npm test` shows 9 passing.
- [ ] `npm run dev:all` boots both servers.
- [ ] UI round-trip works against real OpenAI.
- [ ] Messages persist in `database/emt.db`.
- [ ] Server refuses to start without `OPENAI_API_KEY` (verified in Task 3 step 2).
