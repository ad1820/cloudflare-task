import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { answerQuestion } from "./ai";
import { createInitialMatch } from "./data";
import { persistMatch, persistNote, persistPrediction } from "./persistence";
import { simulateTenMinutes } from "./simulator";
import type { ChatMessage, ClientEvent, Env, MatchState, Prediction, RoomSnapshot, ServerEvent, TacticalNote } from "./types";

const chatInput = z.object({ text: z.string().trim().min(1).max(500) });
const questionInput = z.object({ question: z.string().trim().min(2).max(500) });
const joinInput = z.object({ userId: z.string().min(1).max(80), displayName: z.string().trim().min(1).max(40) });
const predictionInput = z.object({
  userId: z.string().min(1).max(80), displayName: z.string().trim().min(1).max(40),
  outcome: z.enum(["home", "draw", "away"]), homeScore: z.number().int().min(0).max(20).optional(), awayScore: z.number().int().min(0).max(20).optional(),
});

type Session = { userId: string; displayName: string };

export class MatchRoom extends DurableObject<Env> {
  private readonly roomId: string;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.roomId = ctx.id.name ?? "real-madrid-barcelona-001";
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") === "websocket") return this.connectWebSocket(request);
    if (request.method === "GET" && url.pathname.endsWith("/state")) return Response.json(await this.snapshot());
    if (request.method === "POST" && url.pathname.endsWith("/simulate")) return this.simulate(request);
    if (request.method === "POST" && url.pathname.endsWith("/reset")) return this.resetMatch();
    if (request.method === "POST" && url.pathname.endsWith("/predictions")) return this.addPrediction(request);
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return this.send(ws, { type: "error", payload: { code: "INVALID_MESSAGE", message: "Text messages only." } });
    let event: ClientEvent;
    try { event = JSON.parse(message) as ClientEvent; }
    catch { return this.send(ws, { type: "error", payload: { code: "INVALID_JSON", message: "Message must be valid JSON." } }); }
    const session = (ws.deserializeAttachment() as Session | null) ?? { userId: crypto.randomUUID(), displayName: "Guest" };

    if (event.type === "ping") return this.send(ws, { type: "pong" });
    if (event.type === "join") {
      const parsed = joinInput.safeParse(event.payload);
      if (!parsed.success) return this.send(ws, { type: "error", payload: { code: "INVALID_JOIN", message: "Choose a valid display name." } });
      ws.serializeAttachment(parsed.data);
      this.send(ws, { type: "room.snapshot", payload: await this.snapshot() });
      return this.broadcastPresence();
    }
    if (event.type === "chat.send") {
      const parsed = chatInput.safeParse(event.payload);
      if (!parsed.success) return this.send(ws, { type: "error", payload: { code: "INVALID_CHAT", message: "Message must be 1–500 characters." } });
      const chat = await this.read<ChatMessage[]>("chat", []);
      const created: ChatMessage = { id: crypto.randomUUID(), ...session, text: parsed.data.text, createdAt: new Date().toISOString() };
      await this.ctx.storage.put("chat", [...chat, created].slice(-100));
      return this.broadcast({ type: "chat.created", payload: created });
    }
    if (event.type === "ai.ask") {
      const parsed = questionInput.safeParse(event.payload);
      if (!parsed.success) return this.send(ws, { type: "error", payload: { code: "INVALID_QUESTION", message: "Question must be 2–500 characters." } });
      const requestId = crypto.randomUUID();
      this.broadcast({ type: "ai.thinking", payload: { requestId } });
      try {
        const answer = await answerQuestion(this.env, await this.snapshot(), parsed.data.question, (author, text) => this.rememberNote(author, text));
        this.broadcast({ type: "ai.response", payload: { requestId, answer, provider: "workers-ai", model: this.env.AI_MODEL, aiGenerated: true } });
      } catch (error) {
        console.error("ai_request_failed", { roomId: this.roomId, error: error instanceof Error ? error.message : String(error) });
        this.broadcast({ type: "ai.unavailable", payload: { requestId, message: "The analyst is unavailable. Live match state is unaffected." } });
      }
      return;
    }
    this.send(ws, { type: "error", payload: { code: "UNKNOWN_EVENT", message: "Unknown event type." } });
  }

  async webSocketClose(): Promise<void> { this.broadcastPresence(); }
  async webSocketError(): Promise<void> { this.broadcastPresence(); }

  private async connectWebSocket(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0]; const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId: crypto.randomUUID(), displayName: "Guest" } satisfies Session);
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  private async simulate(request: Request): Promise<Response> {
    const body = await request.json<{ idempotencyKey?: string }>().catch(() => ({ idempotencyKey: undefined }));
    const { idempotencyKey } = body;
    const keys = await this.read<string[]>("simulationKeys", []);
    if (idempotencyKey && keys.includes(idempotencyKey)) return Response.json({ duplicate: true, state: await this.match() });
    const result = simulateTenMinutes(await this.match());
    await this.ctx.storage.put("match", result.state);
    if (idempotencyKey) await this.ctx.storage.put("simulationKeys", [...keys, idempotencyKey].slice(-30));
    this.broadcast({ type: "match.updated", payload: result.state });
    this.ctx.waitUntil(persistMatch(this.env, result.state).catch((error) => console.error("mongodb_match_persist_failed", { roomId: this.roomId, error: String(error) })));
    return Response.json(result);
  }

  private async resetMatch(): Promise<Response> {
    const created = createInitialMatch(this.roomId);
    await this.ctx.storage.put("match", created);
    await this.ctx.storage.put("simulationKeys", []);
    this.broadcast({ type: "match.updated", payload: created });
    return Response.json({ ok: true, state: created });
  }

  private async addPrediction(request: Request): Promise<Response> {
    const parsed = predictionInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid prediction", details: parsed.error.flatten() }, { status: 400 });
    const created: Prediction = { id: crypto.randomUUID(), ...parsed.data, createdAt: new Date().toISOString() };
    const predictions = await this.read<Prediction[]>("predictions", []);
    await this.ctx.storage.put("predictions", [...predictions.filter((item) => item.userId !== created.userId), created].slice(-100));
    this.ctx.waitUntil(persistPrediction(this.env, this.roomId, created).catch((error) => console.error("mongodb_prediction_persist_failed", { roomId: this.roomId, error: String(error) })));
    return Response.json(created, { status: 201 });
  }

  private async rememberNote(author: string, text: string): Promise<TacticalNote> {
    const note: TacticalNote = { id: crypto.randomUUID(), author: author.slice(0, 40), text: text.slice(0, 280), minute: (await this.match()).minute, createdAt: new Date().toISOString() };
    const notes = await this.read<TacticalNote[]>("notes", []);
    await this.ctx.storage.put("notes", [...notes, note].slice(-50));
    this.ctx.waitUntil(persistNote(this.env, this.roomId, note).catch((error) => console.error("mongodb_note_persist_failed", { roomId: this.roomId, error: String(error) })));
    return note;
  }

  private async snapshot(): Promise<RoomSnapshot> {
    const [match, chat, notes, predictions] = await Promise.all([
      this.match(), this.read<ChatMessage[]>("chat", []), this.read<TacticalNote[]>("notes", []), this.read<Prediction[]>("predictions", []),
    ]);
    return { match, chat, notes, predictions, connectedUsers: this.ctx.getWebSockets().length };
  }

  private async match(): Promise<MatchState> {
    const current = await this.ctx.storage.get<MatchState>("match");
    if (current) return current;
    const created = createInitialMatch(this.roomId);
    await this.ctx.storage.put("match", created);
    return created;
  }

  private async read<T>(key: string, fallback: T): Promise<T> { return (await this.ctx.storage.get<T>(key)) ?? fallback; }
  private send(ws: WebSocket, event: ServerEvent) { try { ws.send(JSON.stringify(event)); } catch { /* closed socket */ } }
  private broadcast(event: ServerEvent) { for (const ws of this.ctx.getWebSockets()) this.send(ws, event); }
  private broadcastPresence() { this.broadcast({ type: "presence.updated", payload: { connectedUsers: this.ctx.getWebSockets().length } }); }
}
