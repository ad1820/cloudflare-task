import type { Lineup, MatchState, MatchStats } from "./types";

// Deliberately curated all-time squads rather than current-season rosters.
const homeNames = [
  "Iker Casillas", "Dani Carvajal", "Sergio Ramos", "Fernando Hierro", "Roberto Carlos",
  "Luka Modric", "Zinedine Zidane", "Alfredo Di Stefano",
  "Cristiano Ronaldo", "Raul", "Ferenc Puskas", "Karim Benzema", "Toni Kroos",
];
const awayNames = [
  "Victor Valdes", "Dani Alves", "Carles Puyol", "Ronald Koeman", "Jordi Alba",
  "Xavi", "Sergio Busquets", "Andres Iniesta",
  "Lionel Messi", "Johan Cruyff", "Ronaldinho", "Luis Suarez", "Ladislao Kubala",
];

function players(prefix: string, names: string[]): Lineup["home"] {
  return names.map((name, index) => ({
    id: `${prefix}-${index + 1}`,
    name,
    number: index + 1,
    position: index === 0 ? "GK" : index < 5 ? "DEF" : index < 8 ? "MID" : "FWD",
    onPitch: index < 11,
  }));
}

export const initialLineup = (): Lineup => ({ home: players("rma", homeNames), away: players("bar", awayNames) });

export const initialStats = (): MatchStats => ({
  possession: { home: 50, away: 50 }, shots: { home: 0, away: 0 },
  shotsOnTarget: { home: 0, away: 0 }, corners: { home: 0, away: 0 },
  fouls: { home: 0, away: 0 }, yellowCards: { home: 0, away: 0 },
});

export function createInitialMatch(id = "real-madrid-barcelona-001"): MatchState {
  return {
    id, homeTeam: "Real Madrid", awayTeam: "Barcelona", score: { home: 0, away: 0 },
    minute: 0, status: "scheduled", revision: 0, seed: hashString(id), stats: initialStats(),
    events: [], lineup: initialLineup(),
  };
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}
