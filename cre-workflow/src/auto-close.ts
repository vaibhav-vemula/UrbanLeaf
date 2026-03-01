/**
 * UrbanLeaf AI — CRE Workflow: Automated Proposal Lifecycle Manager
 *
 * Trigger: Cron — runs daily at midnight UTC
 *
 * Flow:
 *   1. Read all active proposals from Arbitrum Sepolia
 *   2. For each proposal whose voting deadline has passed:
 *      a. Call Gemini AI to generate a closing summary
 *      b. Call updateProposalStatus() on-chain to finalise the result
 *
 * This removes the need for a human operator to manually close proposals,
 * making UrbanLeaf governance fully autonomous via CRE.
 */

import { workflow, cron, evm, http } from "@chainlink/cre-sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveProposal {
  id: bigint;
  parkName: string;
  endDate: bigint;
  yesVotes: bigint;
  noVotes: bigint;
  aiEnvironmentalScore: number;
}

interface ClosingSummary {
  outcome: "Accepted" | "Declined";
  summary: string;
}

// ---------------------------------------------------------------------------
// Workflow definition
// ---------------------------------------------------------------------------

export default workflow({
  name: "auto-close",
  description:
    "Daily cron that reads active proposals from Arbitrum Sepolia, closes " +
    "expired ones on-chain, and uses Gemini AI to generate closing summaries.",

  // -------------------------------------------------------------------------
  // Trigger: Cron — every day at midnight UTC
  // -------------------------------------------------------------------------
  triggers: [
    cron.trigger({
      schedule: "0 0 * * *",
    }),
  ],

  // -------------------------------------------------------------------------
  // Workflow steps
  // -------------------------------------------------------------------------
  run: async (ctx) => {
    const now = BigInt(Math.floor(Date.now() / 1000));

    ctx.log(`[UrbanLeaf CRE] Auto-close run at ${new Date().toISOString()}`);

    // -----------------------------------------------------------------------
    // Step 1: Read all active proposal IDs from Arbitrum Sepolia
    // -----------------------------------------------------------------------
    const activeIdsRaw = await evm.read({
      chainId: 421614,
      rpcUrl: ctx.secrets.ARBITRUM_SEPOLIA_RPC_URL,
      contractAddress: ctx.secrets.CONTRACT_ADDRESS,
      abi: ["function getAllActiveProposals() external view returns (uint64[] memory)"],
      functionName: "getAllActiveProposals",
      args: [],
    });

    const activeIds = activeIdsRaw as bigint[];
    ctx.log(`[UrbanLeaf CRE] Found ${activeIds.length} active proposal(s)`);

    if (activeIds.length === 0) {
      return { closedCount: 0, message: "No active proposals to process." };
    }

    // -----------------------------------------------------------------------
    // Step 2: Fetch each proposal and find expired ones
    // -----------------------------------------------------------------------
    const getProposalAbi = [
      `function getProposal(uint64 proposalId) external view returns (
        tuple(
          uint64 id,
          string parkName,
          string parkId,
          string description,
          uint256 endDate,
          uint8 status,
          uint64 yesVotes,
          uint64 noVotes,
          tuple(uint256,uint256,uint256,uint256,uint256,uint256) environmentalData,
          tuple(uint64,uint64,uint64,uint64) demographics,
          string creatorAccountId,
          uint256 fundingGoal,
          uint256 totalFundsRaised,
          bool fundingEnabled,
          uint8 aiEnvironmentalScore,
          string aiUrgencyLevel,
          string aiInsight,
          bool aiScored
        )
      )`,
    ];

    const expired: ActiveProposal[] = [];

    for (const id of activeIds) {
      const raw = await evm.read({
        chainId: 421614,
        rpcUrl: ctx.secrets.ARBITRUM_SEPOLIA_RPC_URL,
        contractAddress: ctx.secrets.CONTRACT_ADDRESS,
        abi: getProposalAbi,
        functionName: "getProposal",
        args: [id],
      });

      const proposal = raw as ActiveProposal;

      if (proposal.endDate < now) {
        expired.push(proposal);
        ctx.log(
          `[UrbanLeaf CRE] Proposal #${id} (${proposal.parkName}) expired — ` +
            `yes=${proposal.yesVotes}, no=${proposal.noVotes}`
        );
      }
    }

    ctx.log(`[UrbanLeaf CRE] ${expired.length} proposal(s) ready to close`);

    // -----------------------------------------------------------------------
    // Step 3: Close each expired proposal
    // -----------------------------------------------------------------------
    const updateAbi = [
      "function updateProposalStatus(uint64 proposalId) external",
    ];

    const closed: { id: string; outcome: string; summary: string }[] = [];

    for (const proposal of expired) {
      // Generate an AI closing summary via Gemini
      const summary = await generateClosingSummary(ctx, proposal);

      // Write on-chain: updateProposalStatus() tallies votes and sets final status
      await evm.write({
        chainId: 421614,
        rpcUrl: ctx.secrets.ARBITRUM_SEPOLIA_RPC_URL,
        contractAddress: ctx.secrets.CONTRACT_ADDRESS,
        abi: updateAbi,
        functionName: "updateProposalStatus",
        args: [proposal.id],
      });

      ctx.log(
        `[UrbanLeaf CRE] Closed proposal #${proposal.id} — ` +
          `${summary.outcome}: "${summary.summary}"`
      );

      closed.push({
        id: proposal.id.toString(),
        outcome: summary.outcome,
        summary: summary.summary,
      });
    }

    return {
      closedCount: closed.length,
      proposals: closed,
    };
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function generateClosingSummary(
  ctx: any,
  proposal: ActiveProposal
): Promise<ClosingSummary> {
  const outcome =
    proposal.yesVotes > proposal.noVotes ? "Accepted" : "Declined";

  const prompt = `You are an UrbanLeaf AI assistant. A community park protection proposal has just closed.

Park: ${proposal.parkName}
Votes in favour: ${proposal.yesVotes}
Votes against: ${proposal.noVotes}
Outcome: ${outcome}
Environmental urgency score: ${proposal.aiEnvironmentalScore}/100

Write a single sentence (max 140 chars) summarising the outcome for the community newsletter.`;

  try {
    const res = await http.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${ctx.secrets.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 80 },
        }),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const text: string =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return { outcome, summary: text.trim().substring(0, 140) };
    }
  } catch {
    // Fall through to default
  }

  return {
    outcome,
    summary: `Proposal for ${proposal.parkName} ${outcome.toLowerCase()} with ${proposal.yesVotes} yes / ${proposal.noVotes} no votes.`,
  };
}
