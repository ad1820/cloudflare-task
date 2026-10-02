import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "./types";

type SimulationParams = { matchId: string; idempotencyKey: string };

export class MatchSimulationWorkflow extends WorkflowEntrypoint<Env, SimulationParams> {
  async run(event: WorkflowEvent<SimulationParams>, step: WorkflowStep) {
    const result = await step.do("advance-authoritative-match-state", { retries: { limit: 3, delay: "1 second", backoff: "exponential" } }, async () => {
      const id = this.env.MATCH_ROOMS.idFromName(event.payload.matchId);
      const response = await this.env.MATCH_ROOMS.get(id).fetch("https://room.internal/simulate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: event.payload.idempotencyKey }),
      });
      if (!response.ok) throw new Error(`Room simulation failed: ${response.status}`);
      return response.text();
    });
    return result;
  }
}
