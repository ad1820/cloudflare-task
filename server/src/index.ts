import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { loadHistory } from "./persistence";
import type { Env } from "./types";

export { MatchRoom } from "./match-room";
export { MatchSimulationWorkflow } from "./workflow";

const app = new Hono<{ Bindings: Env }>();
const matchIdSchema = z.string().regex(/^[a-z0-9-]{3,80}$/);

app.use("/api/*", async (context, next) => {
  const middleware = cors({
    origin: (origin) => !origin || origin === context.env.ALLOWED_ORIGIN ? origin : context.env.ALLOWED_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["Content-Type"], maxAge: 86400,
  });
  return middleware(context, next);
});

app.get("/health", (context) => context.json({ ok: true, service: "90th-minute-api" }));
app.get("/api/matches", (context) => context.json([{ id: "real-madrid-barcelona-001", homeTeam: "Real Madrid", awayTeam: "Barcelona" }]));

app.all("/api/matches/:id/*", async (context, next) => {
  if (!matchIdSchema.safeParse(context.req.param("id")).success) return context.json({ error: "Invalid match ID" }, 400);
  return next();
});

app.get("/api/matches/:id", async (context) => proxyRoom(context.env, context.req.param("id"), "/state"));
app.get("/api/matches/:id/live", async (context) => proxyRoom(context.env, context.req.param("id"), "/live", context.req.raw));
app.post("/api/matches/:id/simulate", async (context) => {
  const matchId = context.req.param("id");
  const idempotencyKey = crypto.randomUUID();
  const instance = await context.env.MATCH_WORKFLOW.create({ id: `simulate-${matchId}-${idempotencyKey}`, params: { matchId, idempotencyKey } });
  return context.json({ accepted: true, workflowId: instance.id }, 202);
});
app.post("/api/matches/:id/reset", async (context) => proxyRoom(context.env, context.req.param("id"), "/reset", context.req.raw));
app.post("/api/matches/:id/predictions", async (context) => proxyRoom(context.env, context.req.param("id"), "/predictions", context.req.raw));
app.get("/api/matches/:id/history", async (context) => {
  try { return context.json({ history: await loadHistory(context.env, context.req.param("id")), persistent: Boolean(context.env.MONGODB_URI) }); }
  catch (error) { console.error("mongodb_history_failed", { error: String(error) }); return context.json({ history: [], persistent: false, warning: "History persistence is temporarily unavailable." }); }
});

app.notFound((context) => context.json({ error: "Not found" }, 404));
app.onError((error, context) => { console.error("request_failed", { path: context.req.path, error: error.message }); return context.json({ error: "Internal server error" }, 500); });

function proxyRoom(env: Env, matchId: string, path: string, original?: Request) {
  const stub = env.MATCH_ROOMS.get(env.MATCH_ROOMS.idFromName(matchId));
  const headers = original ? new Headers(original.headers) : new Headers();
  return stub.fetch(`https://room.internal${path}`, { method: original?.method ?? "GET", headers, body: original?.body });
}

export default app;
