import type { EventKind, MatchEvent, MatchState, TeamSide } from "./types";

function random(seed: number): [number, number] {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return [next / 4294967296, next];
}

const labels: Record<EventKind, (team: string, player: string) => string> = {
  kickoff: () => "Kick-off — the match is under way.",
  shot: (team, player) => `${player} pulls a shot wide for ${team}.`,
  shot_on_target: (team, player) => `${player} tests the goalkeeper for ${team}.`,
  goal: (team, player) => `GOAL! ${player} finishes for ${team}.`,
  save: (team) => `${team}'s goalkeeper makes an important save.`,
  yellow_card: (team, player) => `${player} is booked for ${team}.`,
  substitution: (team, player) => `${team} make a change: ${player} enters the match.`,
  dangerous_attack: (team) => `${team} build a dangerous attack.`,
  possession_shift: (team) => `${team} are beginning to control possession.`,
  half_time: () => "Half-time.", full_time: () => "Full-time.",
};

function choosePlayer(state: MatchState, side: TeamSide, value: number) {
  const active = state.lineup[side].filter((player) => player.onPitch);
  return active[Math.floor(value * active.length)]?.name ?? "a player";
}

export function simulateTenMinutes(input: MatchState): { state: MatchState; newEvents: MatchEvent[] } {
  if (input.status === "finished") return { state: structuredClone(input), newEvents: [] };
  const state = structuredClone(input);
  const start = state.minute;
  state.status = "live";
  const target = Math.min(90, start < 45 && start + 10 > 45 ? 45 : start + 10);
  const newEvents: MatchEvent[] = [];
  let seed = state.seed;

  if (start === 0 && state.events.length === 0) newEvents.push(makeEvent(state, 1, "kickoff"));
  for (let minute = Math.max(1, start + 1); minute <= target; minute++) {
    let roll; [roll, seed] = random(seed);
    let sideRoll; [sideRoll, seed] = random(seed);
    let playerRoll; [playerRoll, seed] = random(seed);
    if (roll > 0.43) continue;
    const side: TeamSide = sideRoll < state.stats.possession.home / 100 ? "home" : "away";
    const team = side === "home" ? state.homeTeam : state.awayTeam;
    const player = choosePlayer(state, side, playerRoll);
    let kind: EventKind;
    if (roll < 0.025) kind = "goal";
    else if (roll < 0.09) kind = "shot_on_target";
    else if (roll < 0.18) kind = "shot";
    else if (roll < 0.23) kind = "yellow_card";
    else if (roll < 0.28 && minute > 55) kind = "substitution";
    else if (roll < 0.36) kind = "dangerous_attack";
    else kind = "possession_shift";
    applyEvent(state, kind, side);
    newEvents.push(makeEvent(state, minute, kind, side, player, team));
  }
  state.minute = target;
  state.seed = seed;
  if (start < 45 && target === 45) { state.status = "half-time"; newEvents.push(makeEvent(state, 45, "half_time")); }
  if (target === 90) { state.status = "finished"; newEvents.push(makeEvent(state, 90, "full_time")); }
  state.events = [...state.events, ...newEvents].slice(-100);
  state.revision += 1;
  return { state, newEvents };
}

export const simulateFiveMinutes = simulateTenMinutes;

function applyEvent(state: MatchState, kind: EventKind, side: TeamSide) {
  if (kind === "goal") { state.score[side]++; state.stats.shots[side]++; state.stats.shotsOnTarget[side]++; }
  if (kind === "shot") state.stats.shots[side]++;
  if (kind === "shot_on_target") { state.stats.shots[side]++; state.stats.shotsOnTarget[side]++; }
  if (kind === "yellow_card") { state.stats.yellowCards[side]++; state.stats.fouls[side]++; }
  if (kind === "possession_shift") {
    const home = Math.max(35, Math.min(65, state.stats.possession.home + (side === "home" ? 3 : -3)));
    state.stats.possession = { home, away: 100 - home };
  }
}

function makeEvent(state: MatchState, minute: number, kind: EventKind, side?: TeamSide, player = "", team = ""): MatchEvent {
  return {
    id: `${state.id}-${state.revision + 1}-${minute}-${kind}`,
    minute, kind, side, player: player || undefined,
    summary: labels[kind](team, player), createdAt: new Date().toISOString(),
  };
}
