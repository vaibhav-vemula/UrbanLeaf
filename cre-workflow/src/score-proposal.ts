/**
 * UrbanLeaf AI — CRE Workflow: Environmental Impact Scorer (HTTP Trigger)
 *
 * Trigger: HTTP POST /score-proposal
 *   Called by the UrbanLeaf backend immediately after a proposal is
 *   created on-chain. Backend passes proposalId + parkId.
 *
 * Pipeline (shared with evm-score-proposal):
 *   1. Fetch live NDVI + air quality from UrbanLeaf FastAPI
 *   2. Gemini AI → urgency score (0-100) + level + insight
 *   3. Write score on-chain via UrbanLeafCommunity.setEnvironmentalScore()
 *
 * See also: evm-score-proposal.ts — the autonomous EVM Log trigger
 * version of this workflow that fires directly from the ProposalCreated
 * on-chain event with no backend involvement.
 */

import { workflow, http } from "@chainlink/cre-sdk";
import { runScoringPipeline } from "./scoring.js";

export default workflow({
  name: "score-proposal",
  description:
    "HTTP trigger: backend calls this after creating a proposal. " +
    "Fetches env data, runs Gemini AI scoring, writes result on-chain.",

  triggers: [
    http.trigger({
      path: "/score-proposal",
      method: "POST",
    }),
  ],

  run: async (ctx) => {
    const { proposalId, parkId } = ctx.trigger.body as {
      proposalId: string;
      parkId: string;
    };

    ctx.log(`[UrbanLeaf CRE] HTTP trigger → scoring proposal #${proposalId} (park: ${parkId})`);

    const result = await runScoringPipeline(ctx, proposalId, parkId);

    return { ...result, trigger: "http", status: "scored" };
  },
});
