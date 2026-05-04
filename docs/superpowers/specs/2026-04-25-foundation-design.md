# Foundation — Design Spec

Sub-project #1 of the EMT Scenario Trainer faithful rebuild. See `CLAUDE.md` for the full product context and the planned 6-phase decomposition.

## Goal

A walking skeleton: user opens the React UI, sends a chat message, the backend persists it to SQLite, calls OpenAI, persists and returns the assistant reply. No scenario logic, no grading, no RAG — those land in later sub-projects.

## Scope

**In scope**
- Express server with helmet, cors, express-rate-limit
- SQLite (`better-sqlite3`) with schema + manager module
- OpenAI client wrapper reading `OPENAI_API_KEY`
- `POST /api/chat` route
- `chatService` and `sessionManager`
- React 19 + Vite frontend shell with a minimal `TestConnection` chat box
- `.env.example`, `vite.config.js` proxy, npm scripts matching the original
- Smoke tests via the original-style custom runner

**Out of scope (deferred to later sub-projects)**
- Scenario generation, templates, scenario-type selection UI
- Patient simulator, vitals, bystanders, environment
- Action recognition, grading, performance evaluation, feedback UI
- PDF processing / RAG
- Conversation summarization, scenario ending logic
- Speech-to-text
- Deployment / `gh-pages`

## Architecture

```
Browser (React + Vite :5173)
  └─ fetch POST /api/chat ──► Vite proxy ──► Express :3000
                                                │
                                                ├─ helmet, cors, rate-limit
                                                ├─ routes/chat.js
                                                │     └─ services/chatService.js
                                                │           ├─ services/sessionManager.js
                                                │           │     └─ database/databaseManager.js (better-sqlite3)
                                                │           └─ config/openai.js
                                                └─ JSON response
```

## Directory Layout

```
config/
  openai.js                # exports configured OpenAI client; throws if OPENAI_API_KEY missing
database/
  schema.sql               # CREATE TABLE statements (sessions, messages)
  databaseManager.js       # opens db file, runs schema on init, exposes prepared statements
routes/
  chat.js                  # express.Router(); POST / → chatService.handleMessage
services/
  chatService.js           # orchestrates: history → openai → persist → reply
  sessionManager.js        # createSession, getSession, appendMessage, getHistory
src/
  main.jsx                 # React 19 root
  App.jsx                  # router shell with single route → TestConnection
  Header.jsx               # static nav header
  TestConnection.jsx       # input + send button + message list, hits /api/chat
  index.css                # minimal styles
test/
  test-runner.js           # discovers and runs *.test.js files
  sessionManager.test.js   # round-trip: create → append → getHistory
  chatRoute.test.js        # POST /api/chat with mocked openai client
server.js                  # Express bootstrap, mounts /api/chat, serves nothing else yet
vite.config.js             # react plugin + server.proxy { '/api': 'http://localhost:3000' }
index.html                 # vite entry
.env.example               # OPENAI_API_KEY=, # PORT=3000
package.json               # exact deps + scripts from original
```

## Data Model

`database/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  scenario_type TEXT,        -- nullable; set in sub-project #2
  state TEXT                 -- JSON blob; nullable; reserved for later phases
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

DB file path: `database/emt.db` (gitignored). `databaseManager.js` runs `schema.sql` on first open (idempotent).

## API

**`POST /api/chat`**

Request:
```json
{ "sessionId": "string|null", "message": "string" }
```

Response:
```json
{ "sessionId": "string", "reply": "string" }
```

Behavior:
- If `sessionId` is null/missing → create a new session (UUID).
- Append user message; load full history for that session; call OpenAI Chat Completions (`gpt-4o-mini` default, configurable later); append assistant reply; return both `sessionId` and `reply`.
- Errors: 400 on missing `message`; 500 on OpenAI failure (with generic message; details logged server-side).

## Modules — Responsibilities & Interfaces

**`config/openai.js`**
- `export default new OpenAI({ apiKey: process.env.OPENAI_API_KEY })`
- Throws on import if key missing (fail fast at startup).

**`database/databaseManager.js`**
- `getDb()` — opens once, runs `schema.sql`, returns the better-sqlite3 instance.
- Exposes prepared statements lazily (called by `sessionManager`, not from anywhere else).

**`services/sessionManager.js`**
- `createSession() → sessionId`
- `getSession(id) → row | null`
- `appendMessage(sessionId, role, content) → void`
- `getHistory(sessionId) → [{role, content}]`
- This is the only module that touches `databaseManager`.

**`services/chatService.js`**
- `handleMessage({ sessionId, message }) → { sessionId, reply }`
- Orchestrates session lookup/creation, history fetch, OpenAI call, persistence.
- This is the only module that touches `config/openai.js`.

**`routes/chat.js`**
- Thin: validates body, calls `chatService.handleMessage`, returns JSON.

**`server.js`**
- Loads dotenv, applies helmet + cors + rate-limit, mounts `/api/chat`, listens on `PORT || 3000`.

**`src/TestConnection.jsx`**
- Local state: `sessionId`, `messages[]`, `input`. Submits to `/api/chat`, appends both user and assistant messages on success. Disabled while in flight. Surfaces error text on failure.

## Error Handling

- Missing `OPENAI_API_KEY`: server refuses to start; log a clear instruction.
- 400 on missing/blank `message`.
- 500 on OpenAI/db errors with a generic client-facing message; full stack logged server-side.
- Frontend: surfaces error string in the chat box; never crashes.

## Testing

Custom runner (`test/test-runner.js`) that requires every `*.test.js` under `test/` and runs exported `tests` arrays of `{ name, fn }`. Failures throw and exit non-zero.

- **`sessionManager.test.js`** — uses an in-memory sqlite (`':memory:'`) via a test-only `getDb` override; asserts create/append/getHistory round-trip.
- **`chatRoute.test.js`** — supertest-style call against the express app with `config/openai.js` swapped for a stub returning a fixed reply; asserts response shape and that the message was persisted.

Goal: green `npm test` after implementation.

## NPM Scripts (mirrored from original)

```
"start":           "node server.js",
"dev":             "nodemon server.js",
"dev:frontend":    "vite",
"dev:all":         "concurrently -k -n backend,frontend \"nodemon server.js\" \"vite\"",
"dev:backend":     "nodemon server.js",
"build":           "vite build",
"preview":         "vite preview",
"lint":            "eslint .",
"test":            "node test/test-runner.js"
```

Deploy/`gh-pages` script deferred to phase 6.

## Dependencies (locked to original)

Runtime: `express`, `cors`, `helmet`, `express-rate-limit`, `dotenv`, `better-sqlite3`, `openai`, `react`, `react-dom`, `react-router-dom`.
Dev: `vite`, `@vitejs/plugin-react`, `nodemon`, `concurrently`, `eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `@types/react`, `@types/react-dom`.

(Deferred: `pdf-parse`, `path-to-regexp`, `jest`, `gh-pages` — added when their phases land.)

## Acceptance Criteria

1. `npm install` clean.
2. `npm run dev:all` boots backend on `:3000` and frontend on `:5173`.
3. Loading `http://localhost:5173` shows TestConnection page.
4. Sending a message returns an OpenAI reply, both messages appear in the UI, and both rows exist in `sessions`/`messages`.
5. `npm test` passes.
6. Server refuses to start without `OPENAI_API_KEY`.
