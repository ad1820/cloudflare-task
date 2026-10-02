export type TeamSide = "home" | "away";
export type MatchStatus = "scheduled" | "live" | "half-time" | "finished";
export type EventKind =
  | "kickoff" | "shot" | "shot_on_target" | "goal" | "save"
  | "yellow_card" | "substitution" | "dangerous_attack" | "possession_shift"
  | "half_time" | "full_time";

export interface Player { id: string; name: string; number: number; position: string; onPitch: boolean }
export interface Lineup { home: Player[]; away: Player[] }
export interface MatchEvent {
  id: string;
  minute: number;
  kind: EventKind;
  side?: TeamSide;
  summary: string;
  player?: string;
  createdAt: string;
}
export interface MatchStats {
  possession: Record<TeamSide, number>;
  shots: Record<TeamSide, number>;
  shotsOnTarget: Record<TeamSide, number>;
  corners: Record<TeamSide, number>;
  fouls: Record<TeamSide, number>;
  yellowCards: Record<TeamSide, number>;
}
export interface ChatMessage {
  id: string;
  userId: string;
  displayName: string;
  text: string;
  createdAt: string;
}
export interface TacticalNote {
  id: string;
  author: string;
  text: string;
  minute: number;
  createdAt: string;
}
export interface Prediction {
  id: string;
  userId: string;
  displayName: string;
  outcome: "home" | "draw" | "away";
  homeScore?: number;
  awayScore?: number;
  createdAt: string;
}
export interface MatchState {
  id: string;
  homeTeam: string;
  awayTeam: string;
  score: Record<TeamSide, number>;
  minute: number;
  status: MatchStatus;
  revision: number;
  seed: number;
  stats: MatchStats;
  events: MatchEvent[];
  lineup: Lineup;
}
export interface RoomSnapshot {
  match: MatchState;
  chat: ChatMessage[];
  notes: TacticalNote[];
  predictions: Prediction[];
  connectedUsers: number;
}

export type ClientEvent =
  | { type: "join"; payload: { userId: string; displayName: string } }
  | { type: "chat.send"; payload: { text: string } }
  | { type: "ai.ask"; payload: { question: string } }
  | { type: "ping" };

export type ServerEvent =
  | { type: "room.snapshot"; payload: RoomSnapshot }
  | { type: "match.updated"; payload: MatchState }
  | { type: "chat.created"; payload: ChatMessage }
  | { type: "presence.updated"; payload: { connectedUsers: number } }
  | { type: "ai.thinking"; payload: { requestId: string } }
  | { type: "ai.response"; payload: { requestId: string; answer: string; provider: "workers-ai"; model: string; aiGenerated: true } }
  | { type: "ai.unavailable"; payload: { requestId: string; message: string } }
  | { type: "error"; payload: { code: string; message: string } }
  | { type: "pong" };

export interface Env {
  MATCH_ROOMS: DurableObjectNamespace;
  MATCH_WORKFLOW: Workflow;
  AI: Ai;
  AI_MODEL: string;
  ALLOWED_ORIGIN: string;
  MONGODB_URI?: string;
  MONGODB_DATABASE?: string;
}
