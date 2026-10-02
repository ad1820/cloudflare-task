# 90th Minute

**90th Minute** is a real-time multiplayer football VAR room built as a focused Cloudflare engineering demonstration. Everyone in a match room sees the same simulated match, live discussion, presence, and AI tactical analysis. The score and statistics come from deterministic application logic—not an LLM.

The included room is an all-time **Real Madrid vs Barcelona** Clásico featuring curated club legends. No paid sports feed or authentication is required.

## Why this project

The project demonstrates the parts of Cloudflare's platform that are hard to show in a conventional CRUD application: single-owner state coordination, hibernating WebSockets, durable workflows, tool-using inference, edge execution, and graceful degradation. Its scope is deliberately small enough to review in one sitting.

## Features

- Shared live score, minute, timeline, statistics, presence, and chat
- Seeded, repeatable five-minute match simulation
- One SQLite-backed Durable Object per match room
- Hibernation WebSocket API with client reconnection and backoff
- Cloudflare Workflow with idempotent state advancement
- Workers AI tactical analyst backed by Cloudflare Llama 3.3
- Eight narrow tools that expose authoritative room data to the model
- Optional MongoDB history, prediction, and tactical-note persistence
- Responsive React/Vite interface
- Input validation, CORS, structured failure paths, and simulator tests

## Architecture

```text
React + Vite client
       |
       | REST + WebSocket
       v
Cloudflare Worker (Hono router)
       |
       +---- MatchRoom Durable Object (one per match ID)
       |       +-- authoritative match state (SQLite-backed storage)
       |       +-- deterministic simulator
       |       +-- hibernating WebSocket connections
       |       +-- recent chat + tactical memory
       |
       +---- Workers AI
       |       +-- Cloudflare Llama 3.3
       |       +-- local, allow-listed tool execution
       |
       +---- Cloudflare Workflow
       |       +-- retryable, idempotent five-minute advance
       |
       +---- MongoDB Atlas (optional / best effort)
               +-- match snapshots
               +-- predictions
               +-- tactical notes
```

### Technology choices

| Technology | Why it exists |
|---|---|
| Durable Objects | A room needs one strongly coordinated owner for ordered mutations and WebSocket broadcast. SQLite-backed storage survives object eviction. |
| WebSocket hibernation | Clients remain connected while an idle room sleeps, reducing duration cost. |
| Workers AI | Keeps inference on the Cloudflare platform and supports function calling with the configured Llama model. |
| Workflows | Makes simulation initiation retryable. An idempotency key prevents retries from advancing the match twice. |
| MongoDB | Stores longer-lived, cross-session history independently of the active room. It is not on the critical gameplay path. |
| React + Vite | Small, familiar, typed client with fast local iteration and a static production build. |
| Hono + Zod | Thin routing and explicit boundary validation without an Express server or heavy framework. |

Cloudflare now recommends Workers for new full-stack applications. This repository keeps the static Vite client independently deployable to Pages or Workers while the stateful backend is a Worker.

## Repository structure

```text
.
├── client/
│   ├── src/App.tsx              # War-room interface
│   ├── src/useMatchRoom.ts      # WebSocket lifecycle and REST actions
│   └── src/styles.css           # Responsive visual system
├── server/
│   ├── src/index.ts             # HTTP/WebSocket router
│   ├── src/match-room.ts        # Durable Object room owner
│   ├── src/simulator.ts         # Deterministic match engine
│   ├── src/ai.ts                # Analyst prompt and tools
│   ├── src/workflow.ts          # Simulation Workflow
│   ├── src/persistence.ts       # Optional MongoDB adapter
│   └── test/simulator.test.ts
├── prompts/PROMPT_HISTORY.md
├── .env.example
└── package.json                 # npm workspaces
```

## Data flow

### Simulation

1. Client posts `simulate`.
2. Worker creates a uniquely named Workflow instance and immediately returns `202`.
3. Workflow invokes the room's internal simulation endpoint with an idempotency key.
4. Durable Object checks that the key has not already run.
5. Seeded application logic advances the state and writes it first.
6. Updated authoritative state is broadcast to every socket.
7. A MongoDB snapshot is attempted in the background. Failure is logged and ignored by the live room.

### AI analysis

```text
User question
  → Durable Object
  → Workers AI receives static instructions + tool definitions
  → model selects one or more tools
  → local tool reads the room snapshot
  → result returns to model
  → concise answer broadcasts with AI provenance
```

The model cannot mutate score, time, events, or statistics. `remember_tactical_note` is the sole writing tool and is limited to non-authoritative room memory.

## State ownership

| Store | Data |
|---|---|
| Durable Object | Live match, event window, chat window, notes, predictions, simulation idempotency keys, active sockets |
| MongoDB | Historical match revisions, persisted predictions, persisted tactical notes |
| React | Rendered snapshot, connection state, current analyst response, local display name |

## Minimal data model

- `MatchState`: teams, score, minute, status, revision, RNG seed, statistics, recent events, lineups
- `ChatMessage`: ID, user ID, display name, text, timestamp
- `TacticalNote`: ID, author, text, match minute, timestamp
- `Prediction`: user, outcome, optional score, timestamp
- MongoDB collections: `match_history`, `predictions`, `tactical_notes`

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- A Cloudflare account for deployed Durable Objects, Workflows, and Workers AI
- Wrangler (installed locally by `npm install`; no global install required)
- Optional MongoDB Atlas cluster for durable history

## Local development

```bash
git clone <repository-url>
cd cloudflare_task
npm install
cp .env.example client/.env.local
cp .env.example server/.dev.vars
npm run dev
```

On PowerShell, use:

```powershell
Copy-Item .env.example client/.env.local
Copy-Item .env.example server/.dev.vars
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` and WebSocket upgrades to Wrangler on port `8787`.

Workers AI remote bindings may require Cloudflare authentication during local development:

```bash
npx wrangler login
```

MongoDB is optional. Leave `MONGODB_URI` blank to run the complete live room without historical persistence.

## Cloudflare setup from scratch

1. Create an account at [dash.cloudflare.com](https://dash.cloudflare.com/).
2. Install dependencies with `npm install`; this installs Wrangler in the workspace.
3. Authenticate:

   ```bash
   npx wrangler login
   npx wrangler whoami
   ```

4. Review `server/wrangler.jsonc`. It declares:
   - the `AI` Workers AI binding;
   - `MATCH_ROOMS` mapped to `MatchRoom`;
   - SQLite Durable Object migration `v1`;
   - `MATCH_WORKFLOW` mapped to `MatchSimulationWorkflow`;
   - observability and non-secret variables.
5. Generate platform binding types after changing bindings:

   ```bash
   cd server
   npx wrangler types
   cd ..
   ```

6. If using MongoDB, create the Worker secret:

   ```bash
   cd server
   npx wrangler secret put MONGODB_URI
   npx wrangler secret put MONGODB_DATABASE
   cd ..
   ```

   `MONGODB_DATABASE` is not sensitive and can instead be added to `vars`, but using a secret keeps environment configuration together.

7. Set `ALLOWED_ORIGIN` in `server/wrangler.jsonc` to the deployed frontend origin.
8. Deploy the stateful backend:

   ```bash
   npm run deploy -w server
   ```

Wrangler provisions the declared Durable Object namespace and Workflow during deployment. The Workers AI binding needs no API key.

## MongoDB Atlas setup

MongoDB's former Atlas Data API was retired, so this project uses the current Node driver rather than obsolete HTTPS endpoints.

1. Create an Atlas project and a free/Flex or dedicated cluster.
2. Create a database user with read/write access only to `90th_minute`.
3. Add appropriate network access. Avoid `0.0.0.0/0` for a real production deployment; use the narrowest networking option your deployment supports.
4. Choose **Connect → Drivers → Node.js** and copy the connection string.
5. Replace the username, password, and database placeholders.
6. Put it in `server/.dev.vars` locally or add it with `wrangler secret put MONGODB_URI` in production.

Collections are created automatically on first write. Recommended indexes for production:

```javascript
db.match_history.createIndex({ matchId: 1, revision: -1 }, { unique: true })
db.predictions.createIndex({ id: 1 }, { unique: true })
db.tactical_notes.createIndex({ id: 1 }, { unique: true })
```

The official driver uses direct database connections. Validate Atlas connectivity from a preview Worker before relying on persistence in a chosen region/tier. The room deliberately remains functional if selection or connection fails.

## Environment configuration

| Name | Location | Required | Meaning |
|---|---|---:|---|
| `VITE_API_BASE_URL` | `client/.env.local` | No | Backend origin; blank uses the current origin |
| `AI_MODEL` | Wrangler `vars` | Yes | Workers AI model ID |
| `ALLOWED_ORIGIN` | Wrangler `vars` | Yes | Exact browser origin accepted by CORS |
| `MONGODB_URI` | `.dev.vars` / Wrangler secret | No | Atlas driver connection string |
| `MONGODB_DATABASE` | `.dev.vars` / secret | No | Database name, defaults to `90th_minute` |

Never prefix server secrets with `VITE_`; Vite exposes those values to browser code.

## Deployment

### Backend

```bash
npm install
npm run test
npm run build
npm run deploy -w server
```

Record the deployed `workers.dev` URL and use it as the frontend's `VITE_API_BASE_URL`.

### Frontend on Cloudflare Pages

1. Push the repository to GitHub.
2. In Cloudflare, choose **Workers & Pages → Create → Pages → Import repository**.
3. Use these build settings:
   - Root directory: `/`
   - Build command: `npm install && npm run build -w client`
   - Output directory: `client/dist`
4. Add `VITE_API_BASE_URL=https://<worker-name>.<account>.workers.dev`.
5. Deploy, then update backend `ALLOWED_ORIGIN` to the final Pages domain and redeploy the Worker.

The client can also be served from Workers Static Assets later; Pages is kept here because it gives the reviewer a simple independent frontend deployment.

## Testing and verification

```bash
npm test
npm run typecheck
npm run build
```

Simulator tests cover repeatability, full-time termination, and possession invariants. Manual smoke test:

1. Open two browser windows at `http://localhost:5173`.
2. Confirm presence changes in both.
3. Send chat from one and see it in the other.
4. Simulate five minutes and confirm identical state in both.
5. Ask the analyst for the current score and recent control.
6. Temporarily remove/disable the AI binding and verify simulation and chat still work.
7. Use an invalid Mongo URI and verify live state still advances.

## REST API

| Method | Route | Result |
|---|---|---|
| `GET` | `/health` | Service health |
| `GET` | `/api/matches` | Available demo matches |
| `GET` | `/api/matches/:id` | Current room snapshot |
| `POST` | `/api/matches/:id/simulate` | Starts five-minute Workflow; returns `202` and workflow ID |
| `POST` | `/api/matches/:id/predictions` | Creates/replaces a user's prediction |
| `GET` | `/api/matches/:id/history` | Up to 20 persisted match revisions |
| `GET` upgrade | `/api/matches/:id/live` | WebSocket connection |

Match IDs must be 3–80 lowercase ASCII letters, digits, or hyphens.

## WebSocket contract

Client → server:

```json
{ "type": "join", "payload": { "userId": "uuid", "displayName": "Aditya" } }
{ "type": "chat.send", "payload": { "text": "Press their left side." } }
{ "type": "ai.ask", "payload": { "question": "Who controlled the last 10 minutes?" } }
{ "type": "ping" }
```

Server → client:

- `room.snapshot` — full initial room view
- `match.updated` — authoritative match replacement
- `chat.created` — append a validated message
- `presence.updated` — connected socket count
- `ai.thinking` — analysis request accepted
- `ai.response` — answer plus provider, model, and `aiGenerated: true`
- `ai.unavailable` — inference failed; gameplay unaffected
- `error` / `pong`

## AI tools

| Tool | Access |
|---|---|
| `get_match_state()` | Teams, score, minute, status |
| `get_recent_events(minutes)` | Recent authoritative events |
| `get_match_statistics()` | Possession, shots, cards, corners, fouls |
| `get_lineup()` | Current lineup status |
| `get_recent_chat(limit)` | Recent discussion |
| `remember_tactical_note(author, text)` | Only permitted AI-side write; never match state |
| `get_tactical_notes()` | Room tactical memory |
| `make_prediction()` | Transparent heuristic outlook marked non-authoritative |

Tools close over a bounded room snapshot; the database is not dumped into the prompt. Tool definitions stay stable to improve prompt-cache reuse.

## Failure handling

- **Workers AI fails:** the Durable Object logs the error and broadcasts `ai.unavailable`. Simulation, chat, and state remain available.
- **MongoDB fails:** persistence promises are handled in `waitUntil`; live room state remains in the Durable Object. History returns an empty list with a warning.
- **WebSocket disconnects:** the client reconnects with exponential backoff (up to 15 seconds) and requests a fresh snapshot after joining.
- **Workflow retries:** idempotency keys retained by the room prevent duplicate advances.
- **Invalid match ID/input:** boundary validation returns `400` or a typed WebSocket error.
- **Object eviction:** durable storage restores room data; hibernating WebSocket attachments restore user identity.

## Security notes

- Secrets live in `.dev.vars` or Wrangler secrets and are gitignored.
- REST and WebSocket input lengths/types are validated.
- CORS permits one configured browser origin; production should not use a wildcard.
- AI tools are an explicit allow-list and do not accept arbitrary URLs, SQL, or object methods.
- The model cannot change authoritative match state.
- Production should add Cloudflare rate limiting for simulation, chat, and AI routes and introduce authenticated identities.
- User text is treated as data; the system prompt instructs the model to rely on tools for facts.
- No authentication is included in this assignment build. User IDs/display names are convenience identities, not security principals.

## Trade-offs and future improvements

- One hard-coded fixture keeps the assignment focused; add match creation and discovery later.
- Simulation is believable, not statistically calibrated to real teams.
- MongoDB duplicates selected room data intentionally for long-term queries. A production build would formalize retention and reconciliation.
- A Workflow is more machinery than one five-minute synchronous step needs, but it demonstrates safe retry/idempotency behavior and leaves room for delayed commentary or scheduled simulation.
- Presence counts sockets, so one person in two tabs counts twice.
- Future work: authentication, real data licensing, multiple fixtures, rate limiting, richer player models, replay, voice, accessibility audit, and end-to-end browser tests.

## Prompt history

AI-assisted coding was used. The required, human-maintained record is in [`prompts/PROMPT_HISTORY.md`](prompts/PROMPT_HISTORY.md). Append future prompts exactly; do not fabricate entries.

## Current platform references

- [Durable Object WebSockets and hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [SQLite-backed Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Workers AI function calling](https://developers.cloudflare.com/workers-ai/features/function-calling/)
- [Cloudflare Llama 3.3 model](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)
- [Workflows configuration](https://developers.cloudflare.com/workers/wrangler/configuration/#workflows)
- [MongoDB Node.js driver](https://www.mongodb.com/docs/drivers/node/current/)

## License

Provided as an application assignment/demo. Add the desired license before public distribution.
