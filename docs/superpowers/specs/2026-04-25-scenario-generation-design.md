# Scenario Generation + shadcn UI — Design Spec

Sub-project #2 of the EMT Scenario Trainer faithful rebuild.

## Goal

User picks a scenario category and subcategory from a polished UI; backend generates a medically-flavored scenario JSON via OpenAI; the user lands on a runner page showing the dispatch and can chat with the system (chat is the same endpoint from #1, now seeded with a system prompt holding the scenario context).

The UI is rebuilt on **Tailwind CSS + shadcn/ui** so this and every later sub-project ship with consistent, accessible primitives.

## Scope

**In scope**
- Tailwind v4 + shadcn/ui setup; `@/` path alias; tailwind globals replace `index.css`.
- shadcn primitives: button, card, input, badge, tabs, scroll-area, separator, skeleton.
- `services/scenarioTypes.js` static catalog (trauma + medical with subtypes).
- `services/templateGenerator.js` per-subtype templates.
- `services/scenarioGenerator.js` OpenAI-backed generator returning a structured scenario.
- `routes/scenarios.js` with `GET /api/scenario-types` and `POST /api/scenarios`.
- Seed a `system` message on scenario creation so existing `/api/chat` works without changes.
- Frontend pages: `SelectionScreen` (`/`), `ScenarioRunner` (`/session/:id`). Header migrated to shadcn.
- Tests: scenarioGenerator with mocked OpenAI, scenarios route integration test.

**Out of scope (deferred)**
- Patient vitals progression, bystanders, environmental events.
- Action recognition and grading.
- PDF / RAG.
- Conversation summarization, scenario ending logic.
- Speech-to-text.

## Catalog

```js
{
  trauma:  ['MVC','Fall','Assault','Sport Injury','Stabbing','GSW','Burn'],
  medical: ['Cardiac','Respiratory','Neurological','Metabolic','Obstetric','Pediatric'],
}
```

## Scenario JSON Shape

```json
{
  "type": "trauma|medical",
  "subtype": "MVC",
  "dispatch": "string — 1-2 sentence radio-style dispatch",
  "patientProfile": {
    "name": "string",
    "age": 34,
    "sex": "male|female",
    "chiefComplaint": "string",
    "vitals": { "hr": 110, "bp": "140/90", "rr": 22, "spo2": 95, "gcs": 15 }
  },
  "environment": {
    "location": "string",
    "weather": "string",
    "lighting": "string",
    "hazards": ["string"]
  },
  "expectedAssessment": "trauma|medical"
}
```

## Architecture & Files

```
config/openai.js                 # unchanged
database/                        # unchanged (state JSON column already present)
routes/
  chat.js                        # unchanged
  scenarios.js                   # NEW: GET /scenario-types, POST /
services/
  sessionManager.js              # +setScenario(id, type, state)
  chatService.js                 # unchanged
  scenarioTypes.js               # NEW: catalog
  templateGenerator.js           # NEW: per-subtype prompt fragments
  scenarioGenerator.js           # NEW: openai → JSON scenario
server.js                        # mount /api/scenarios
src/
  lib/utils.js                   # NEW: cn() helper from shadcn
  components/ui/                 # NEW: shadcn-generated primitives
  components/Header.jsx          # MOVED + restyled with shadcn
  pages/
    SelectionScreen.jsx          # NEW: type tabs + subtype grid
    ScenarioRunner.jsx           # NEW: dispatch card + chat (shadcn)
    TestConnection.jsx           # MOVED to pages/, restyled
  App.jsx                        # routes: /, /session/:id, /test
  index.css                      # Tailwind directives + shadcn css vars
tailwind.config.js               # NEW
postcss.config.js                # NEW
components.json                  # NEW (shadcn config)
jsconfig.json                    # NEW (path alias for editor)
vite.config.js                   # add path alias resolve
test/
  scenarioGenerator.test.js      # NEW
  scenariosRoute.test.js         # NEW
```

## Routes

**`GET /api/scenario-types`** → `{ trauma: [...], medical: [...] }`

**`POST /api/scenarios`** body `{ type, subtype }`
- Validates type/subtype against catalog (400 otherwise).
- Calls `scenarioGenerator.generate(type, subtype)` → scenario JSON.
- Creates session, sets `scenario_type` + `state` (JSON.stringified scenario).
- Persists a `system` message containing the scenario brief so `/api/chat` is grounded automatically.
- Returns `{ sessionId, scenario }`.

## Modules

**`scenarioTypes.js`** — exports the catalog object and a validator.

**`templateGenerator.js`** — `getTemplate(type, subtype)` returns a short string with subtype-specific guidance (e.g. MVC template mentions vehicle dynamics, mechanism of injury).

**`scenarioGenerator.js`** — `makeScenarioGenerator({openai, model})` returns `{ generate(type, subtype) }`. Calls `chat.completions.create` with `response_format: { type: 'json_object' }` and a system prompt instructing the model to return the JSON shape above. Throws on validation failure.

**`sessionManager.js` add:** `setScenario(sessionId, type, stateJson)` — UPDATE row.

## Frontend

- **`SelectionScreen`**: shadcn `Tabs` (Trauma | Medical), grid of `Card` clickables for subtypes, on click POST `/api/scenarios` and `navigate('/session/:id')` with state.
- **`ScenarioRunner`**: shows scenario `dispatch`, `patientProfile`, `environment` in cards; below, a chat panel powered by the same logic as `TestConnection` but using shadcn `Input`, `Button`, `ScrollArea`. Reads scenario from route state, falls back to `GET /api/scenarios/:id` if direct-loaded — wait, simpler: stash the scenario in `sessionStorage` keyed by sessionId and read it back. (No new route needed.)
- **`TestConnection`** kept at `/test` for the dev smoke loop.

## Testing

- `scenarioGenerator.test.js`: stub openai returning canned JSON string; assert parse + validation. Assert error path on invalid type.
- `scenariosRoute.test.js`: supertest POST `/api/scenarios` with stubbed generator; assert session created, system message appended, response shape.

## Acceptance

1. `npm install` clean.
2. `npm run build` succeeds with Tailwind + shadcn.
3. `npm test` passes (existing 9 + new ~6 = 15).
4. Visiting `/` shows the polished SelectionScreen.
5. Picking a subtype generates a scenario, navigates to `/session/:id`, displays dispatch + patient + environment, and chat round-trip works (assistant responses now stay on-scenario thanks to system message).
6. `/test` still works as the bare-bones chat smoke page.
