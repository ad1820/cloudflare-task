export type Side = "home" | "away";
export interface MatchEvent { id: string; minute: number; kind: string; side?: Side; summary: string; player?: string }
export interface Player { id: string; name: string; number: number; position: string; onPitch: boolean }
export interface MatchState {
  id: string; homeTeam: string; awayTeam: string; score: Record<Side, number>; minute: number;
  status: string; revision: number; events: MatchEvent[];
  lineup: Record<Side, Player[]>;
  stats: { possession: Record<Side, number>; shots: Record<Side, number>; shotsOnTarget: Record<Side, number>; corners: Record<Side, number>; fouls: Record<Side, number>; yellowCards: Record<Side, number> };
}
export interface ChatMessage { id: string; userId: string; displayName: string; text: string; createdAt: string }
export interface Snapshot { match: MatchState; chat: ChatMessage[]; notes: unknown[]; predictions: unknown[]; connectedUsers: number }
export type ServerEvent =
  | { type: "room.snapshot"; payload: Snapshot }
  | { type: "match.updated"; payload: MatchState }
  | { type: "chat.created"; payload: ChatMessage }
  | { type: "presence.updated"; payload: { connectedUsers: number } }
  | { type: "ai.thinking"; payload: { requestId: string } }
  | { type: "ai.response"; payload: { requestId: string; answer: string; provider: string; model: string; aiGenerated: true } }
  | { type: "ai.unavailable"; payload: { requestId: string; message: string } }
  | { type: "error"; payload: { message: string } }
  | { type: "pong" };
