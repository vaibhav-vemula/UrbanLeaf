/**
 * UrbanLeaf AI — CRE Workflow: Autonomous On-Chain Environmental Scorer
 *
 * Trigger: EVM Log — fires when ProposalCreated is emitted on Arbitrum Sepolia
 *
 * This is the fully autonomous version of the scoring workflow.
 * No backend call needed — the CRE DON watches the chain itself.
 * The instant a proposal is created on-chain, this workflow fires,
 * scores it with Gemini AI, and writes the result back on-chain.
 *
 * Event watched:
 *   ProposalCreated(uint64 indexed proposalId, string parkName,
 *                   string parkId, uint256 endDate, string creatorAccountId)
 *
 * Pipeline (shared with score-proposal HTTP workflow):
 *   1. Decode proposalId + parkId from the on-chain event
 *   2. Fetch live NDVI + air quality from UrbanLeaf FastAPI
 *   3. Gemini AI → urgency score (0-100) + level + insight
 *   4. Write score on-chain via UrbanLeafCommunity.setEnvironmentalScore()
 */

import { workflow, evm } from "@chainlink/cre-sdk";
import { runScoringPipeline } from "./scoring.js";

// ABI fragment for the event the trigger watches
const PROPOSAL_CREATED_EVENT =
  "event ProposalCreated(uint64 indexed proposalId, string parkName, string parkId, uint256 endDate, string creatorAccountId)";

export default workflow({
  name: "evm-score-proposal",
  description:
    "EVM Log trigger: autonomously fires on ProposalCreated events from " +
    "UrbanLeafCommunity.sol on Arbitrum Sepolia. No backend call needed — " +
    "CRE watches the chain and scores proposals the moment they appear.",

  // -------------------------------------------------------------------------
  // Trigger: EVM Log on ProposalCreated
  // The CRE DON listens to Arbitrum Sepolia for this event.
  // When detected it decodes the event args and passes them to run().
  // -------------------------------------------------------------------------
  triggers: [
    evm.logTrigger({
      chainId: 421614,
      address: process.env.CONTRACT_ADDRESS ?? "",
      abi: [PROPOSAL_CREATED_EVENT],
      eventName: "ProposalCreated",
    }),
  ],

  // -------------------------------------------------------------------------
  // Workflow execution
  // ctx.trigger.args contains the decoded event fields
  // -------------------------------------------------------------------------
  run: async (ctx) => {
    const { proposalId, parkId, parkName } = ctx.trigger.args as {
      proposalId: bigint;
      parkName: string;
      parkId: string;
      endDate: bigint;
      creatorAccountId: string;
    };

    ctx.log(
      `[UrbanLeaf CRE] EVM Log trigger → ProposalCreated detected on-chain\n` +
      `  proposal #${proposalId} | park: "${parkName}" (${parkId})`
    );

    const result = await runScoringPipeline(
      ctx,
      proposalId.toString(),
      parkId
    );

    return { ...result, trigger: "evm-log", status: "scored" };
  },
});
