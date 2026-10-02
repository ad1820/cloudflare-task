# AI-assisted coding prompt history

This log records prompts used to design, build, and refine **90th Minute**.

---

## 2026-10-02 — Initial project brief

**Prompt**

> You are a senior full-stack and AI engineer. I want you to help me build a polished but reasonably scoped project for a Cloudflare Software Engineer application assignment.
>
> Build **90th Minute, a real-time multiplayer AI Football War Room** using React, TypeScript, Cloudflare Workers, a Durable Object per match room, WebSockets, Workers AI with explicit match-state tools, Workflows for deterministic simulation, and MongoDB for longer-lived persistence. The application must continue if AI or MongoDB is unavailable, include basic tests, use no real football API, and provide a comprehensive reviewer-ready README. Work incrementally through architecture, scaffolding, simulation, AI, persistence, frontend, testing, and documentation. Do not invent Cloudflare APIs; verify against current official documentation.

**Purpose**

Define the product, platform constraints, engineering-quality bar, implementation phases, and documentation requirements.

**Important output / decision**

- Durable Object owns coordinated live state and hibernating WebSockets.
- Deterministic seeded simulator owns score/stat changes.
- Workers AI reads authoritative state through explicit tools.
- MongoDB is best-effort long-term persistence, never the live coordinator.

> Note: The original prompt included detailed feature, route, README, failure-handling, and deployment checklists. It was supplied as the initial assignment brief; this entry preserves its requirements in condensed form without adding requests that were not made.

---

## 2026-10-02 — Failover consideration & Resiliency Architecture

**Prompt**

> For the tactical analyst fallback path, evaluate whether we can incorporate an external inference provider (e.g. Groq running Llama 3.3). How can we architect the inference client to maintain provider isolation and prevent third-party quota exhaustion or cold-start latency from blocking the live WebSocket room?

**Purpose**

Evaluate multi-provider LLM redundancy versus edge-native co-location and design failure containment strategies.

**Important output / decision**

- Determined that external third-party API dependencies introduce egress latency, egress network costs, and developer-tier volatility.
- Decided to keep inference co-located natively on Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) behind a strict abstraction boundary.
- Implemented a graceful degradation path: if Workers AI encounters transient rate limits or outages, a non-fatal `ai.unavailable` WebSocket event broadcasts while the live match, WebSockets, and chat continue without interruption.

---

## 2026-10-02 — Native Cloudflare Platform Implementation

**Prompt**

> Proceed with the end-to-end implementation utilizing Cloudflare's edge platform primitives:
> 1. Durable Objects with SQLite-backed storage for authoritative single-owner room state.
> 2. WebSocket Hibernation API to sustain concurrent connections with zero idle compute costs.
> 3. Cloudflare Workflows for idempotent, durable match simulation execution.
> 4. Workers AI with constrained tool-calling to query live match telemetry without mutating state.
> 5. Decoupled, non-blocking MongoDB persistence via `ctx.waitUntil`.

**Purpose**

Authorize production-grade implementation of the distributed architecture on Cloudflare Workers, Hono, and React.

**Important output / decision**

- Deployed Hono on Cloudflare Workers as a high-performance, lightweight edge router.
- Bound `MatchRoom` Durable Object with native SQLite persistence for match state, event feeds, and chat histories.
- Implemented `@cf/meta/llama-3.3-70b-instruct-fp8-fast` with eight allow-listed, read-only tools exposing authoritative room telemetry.
- Engineered `MatchSimulationWorkflow` to ensure network retries never advance game minutes or scores multiple times.

---

## 2026-10-02 — Domain Modeling: All-Time Clásico Fixture

**Prompt**

> Refactor the match fixture domain model to showcase an all-time Real Madrid vs. FC Barcelona Clásico (`real-madrid-barcelona-001`). Model historically curated starting squads and legend benches with realistic tactical attributes, deterministic PRNG seed initialization, and real-time lineup telemetry in the client.

**Purpose**

Replace generic demo teams with high-engagement, domain-authentic club legends to thoroughly demonstrate simulator statistics and player-level event generation.

**Important output / decision**

- Transitioned room identity to `real-madrid-barcelona-001`.
- Structured curated all-time starting XIs and legendary substitutes (Di Stéfano, Zidane, Cristiano Ronaldo vs. Messi, Cruyff, Ronaldinho).
- Exposed starting lineups with active pitch status dynamically in the match pulse panel.

---

## 2026-10-02 — Operational Setup & Monorepo Configuration

**Prompt**

> Create a standardized, step-by-step operational setup guide (`SETUP.md`) tailored for reviewer evaluation. Account for pnpm workspace boundary isolation, Miniflare local emulation, Cloudflare AI credentials binding, and automated verification suites.

**Purpose**

Ensure reviewers can clone, configure, and execute the full stack locally in under 2 minutes with zero environment friction.

**Important output / decision**

- Delivered [SETUP.md](file:///d:/Programming/cloudflare_task/SETUP.md) with explicit PowerShell and Bash instructions.
- Addressed pnpm monorepo workspace command boundaries and Miniflare SQLite emulation.
- Created pre-configured local environment files (`client/.env.local` and `server/.dev.vars`).

---

## 2026-10-02 — UI Refinement: VAR Room Semantics, Wikipedia Crests & Outcome Theming

**Prompt**

> Enhance the client presentation layer:
> 1. Standardize UI terminology from "War room" to "VAR room" across components and telemetry.
> 2. Embed official SVG club crests for Real Madrid CF and FC Barcelona sourced directly from Wikipedia/Wikimedia.
> 3. Implement dynamic, conditional club styling that transforms the interface to Los Blancos (regal gold, navy, white) or Blaugrana (royal blue, garnet, senyera gold) depending on match outcome and live momentum.

**Purpose**

Elevate UI polish and visual feedback, reinforcing the football match atmosphere and rewarding match completion with tailored club branding.

**Important output / decision**

- Rebranded "War room" to "VAR room" across the UI, loading states, and documentation.
- Integrated Wikipedia-sourced vector crests in the scoreboard and lineup sections with zero hotlink degradation.
- Implemented dynamic CSS token switching for Los Blancos and Blaugrana victory themes with celebratory post-match banners.

---

## 2026-10-02 — Match Control: Reset Capability, 10-Minute Simulation Cadence & Repository Hygiene

**Prompt**

> Implement match lifecycle controls and repository hygiene enhancements:
> 1. Add an idempotent match restart/reset capability across the Durable Object and client UI to reinitialize match telemetry to minute 0 with fresh seeds.
> 2. Adjust the deterministic simulation step cadence from 5 minutes to 10 minutes per tick.
> 3. Standardize environment configuration templates (`.env.example`, `client/.env.example`, `server/.dev.vars.example`) and expand `.gitignore` rules for cross-platform Node, pnpm, Miniflare, and IDE artifacts.

**Purpose**

Give reviewers immediate replayability without restarting processes, optimize presentation velocity with 10-minute simulation intervals, and ensure clean repository distribution.

**Important output / decision**

- Implemented `POST /api/matches/:id/reset` on the Worker router and Durable Object that resets SQLite match state, clears idempotency keys, and broadcasts `match.updated` across active WebSockets.
- Refactored `simulateTenMinutes` in the deterministic simulator engine to advance 10 minutes per invocation while observing the 45-minute half-time boundary.
- Added a "Start Again" / "Reset Match" control in the VAR room scoreboard and post-match victory banner.
- Updated `.gitignore` with comprehensive rules for Windows/OSX, pnpm store, Miniflare SQLite artifacts, and IDE configurations, alongside explicit environment examples.
