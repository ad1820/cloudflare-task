import { runWithTools } from "@cloudflare/ai-utils";
import type { ChatMessage, Env, RoomSnapshot, TacticalNote } from "./types";

const SYSTEM_PROMPT = `You are the concise tactical analyst for 90th Minute. Use tools to obtain factual match information. Never invent a score, event, statistic, player, chat message, or note. Distinguish observations from predictions. Keep answers under 120 words and write like a calm football analyst. The application, not you, owns authoritative match state.`;

export async function answerQuestion(
  env: Env,
  snapshot: RoomSnapshot,
  question: string,
  remember: (author: string, text: string) => Promise<TacticalNote>,
): Promise<string> {
  const recentEvents = (minutes = 10) => snapshot.match.events.filter((event) => event.minute >= snapshot.match.minute - minutes).slice(-15);
  const recentChat = (limit = 10): ChatMessage[] => snapshot.chat.slice(-Math.min(limit, 20));
  const tools = [
    tool("get_match_state", "Get authoritative score, minute, status and teams.", {}, async () => ({
      id: snapshot.match.id, homeTeam: snapshot.match.homeTeam, awayTeam: snapshot.match.awayTeam,
      score: snapshot.match.score, minute: snapshot.match.minute, status: snapshot.match.status,
    })),
    tool("get_recent_events", "Get authoritative recent match events.", {
      minutes: { type: "number", description: "Lookback window, between 1 and 30" },
    }, async (args) => recentEvents(clamp(Number(args.minutes ?? 10), 1, 30))),
    tool("get_match_statistics", "Get authoritative possession, shots, cards, corners and fouls.", {}, async () => snapshot.match.stats),
    tool("get_lineup", "Get both lineups and substitution status.", {}, async () => snapshot.match.lineup),
    tool("get_recent_chat", "Get recent user discussion to answer who suggested something.", {
      limit: { type: "number", description: "Maximum messages, between 1 and 20" },
    }, async (args) => recentChat(clamp(Number(args.limit ?? 10), 1, 20))),
    tool("remember_tactical_note", "Save a durable tactical observation only when explicitly asked to remember it.", {
      author: { type: "string", description: "Name of the person making the suggestion" },
      text: { type: "string", description: "Short tactical note" },
    }, async (args) => remember(String(args.author || "Analyst"), String(args.text || "").slice(0, 280))),
    tool("get_tactical_notes", "Get remembered tactical notes for this room.", {}, async () => snapshot.notes.slice(-20)),
    tool("make_prediction", "Calculate a transparent, non-authoritative result outlook from current score and match stats.", {}, async () => prediction(snapshot)),
  ];

  // ai-utils currently ships its own Workers type snapshot; the runtime binding is compatible.
  const result = await runWithTools(env.AI as never, env.AI_MODEL as never, {
    messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: question }],
    tools: tools as never,
  }, { maxRecursiveToolRuns: 4, strictValidation: true });
  return extractText(result);
}

function tool(name: string, description: string, properties: Record<string, unknown>, fn: (args: Record<string, unknown>) => Promise<unknown>) {
  return { name, description, parameters: { type: "object", properties }, function: async (args: Record<string, unknown>) => JSON.stringify(await fn(args)) };
}

function prediction(snapshot: RoomSnapshot) {
  const { score, stats, minute } = snapshot.match;
  const remaining = Math.max(0, 90 - minute);
  const homePressure = stats.shotsOnTarget.home * 2 + stats.shots.home + stats.possession.home / 10;
  const awayPressure = stats.shotsOnTarget.away * 2 + stats.shots.away + stats.possession.away / 10;
  const home = Math.max(5, 35 + (score.home - score.away) * 18 + (homePressure - awayPressure) * remaining / 180);
  const away = Math.max(5, 35 + (score.away - score.home) * 18 + (awayPressure - homePressure) * remaining / 180);
  const draw = Math.max(10, 100 - home - away);
  const total = home + away + draw;
  return { homeWin: Math.round(home / total * 100), draw: Math.round(draw / total * 100), awayWin: Math.round(away / total * 100), basis: "score, time remaining, possession and shots; not authoritative" };
}

function extractText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const candidate = result as { response?: unknown; result?: { response?: unknown } };
    if (typeof candidate.response === "string") return candidate.response;
    if (typeof candidate.result?.response === "string") return candidate.result.response;
  }
  throw new Error("Workers AI returned no text response");
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
