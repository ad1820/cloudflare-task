import { describe, expect, it } from "vitest";
import { createInitialMatch } from "../src/data";
import { simulateFiveMinutes } from "../src/simulator";

describe("deterministic match simulator", () => {
  it("produces the same outcome for the same state", () => {
    const first = simulateFiveMinutes(createInitialMatch("same-room"));
    const second = simulateFiveMinutes(createInitialMatch("same-room"));
    expect(first.state.score).toEqual(second.state.score);
    expect(first.newEvents.map(({ createdAt: _, ...event }) => event)).toEqual(second.newEvents.map(({ createdAt: _, ...event }) => event));
  });

  it("advances at most five minutes and stops at full time", () => {
    let state = createInitialMatch();
    for (let i = 0; i < 20; i++) state = simulateFiveMinutes(state).state;
    expect(state.minute).toBe(90);
    expect(state.status).toBe("finished");
    expect(simulateFiveMinutes(state).state).toEqual(state);
  });

  it("keeps possession normalized", () => {
    let state = createInitialMatch();
    for (let i = 0; i < 12; i++) state = simulateFiveMinutes(state).state;
    expect(state.stats.possession.home + state.stats.possession.away).toBe(100);
    expect(state.stats.possession.home).toBeGreaterThanOrEqual(35);
    expect(state.stats.possession.home).toBeLessThanOrEqual(65);
  });
});
