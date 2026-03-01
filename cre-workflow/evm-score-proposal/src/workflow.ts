/**
 * UrbanLeaf AI — CRE Workflow: Autonomous On-Chain Environmental Scorer
 *
 * Trigger: EVM Log — fires when ProposalCreated is emitted on Arbitrum Sepolia
 *
 * This is the fully autonomous workflow. The CRE DON watches
 * UrbanLeafCommunity.sol directly — no backend call needed.
 * The instant a proposal is created on-chain, CRE decodes the event,
 * scores it with Gemini AI, and writes the result back on-chain.
 */

import { workflow, evm, http } from "@chainlink/cre-sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnvironmentalData {
  ndvi: number;
  pm25: number;
  affectedPopulation: number;
  vegetationLossPercent: number;
  pm25IncreasePercent: number;
  parkName: string;
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export default workflow({
  name: "evm-score-proposal",
  description:
    "EVM Log trigger: autonomously fires on ProposalCreated events from " +
    "UrbanLeafCommunity.sol on Arbitrum Sepolia. Scores proposals with " +
    "Gemini AI and writes the urgency score back on-chain.",

  triggers: [
    evm.logTrigger({
      chainId: 421614,
      address: process.env.CONTRACT_ADDRESS ?? "",
      abi: [
        "event ProposalCreated(uint64 indexed proposalId, string parkName, string parkId, uint256 endDate, string creatorAccountId)",
      ],
      eventName: "ProposalCreated",
    }),
  ],

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

    // -------------------------------------------------------------------------
    // Step 1: Fetch live environmental data from UrbanLeaf FastAPI
    // -------------------------------------------------------------------------
    const envResponse = await http.fetch(
      `${ctx.secrets.URBANLEAF_API_URL}/api/park-environmental-data/${parkId}`,
      { method: "GET", headers: { "Content-Type": "application/json" } }
    );

    if (!envResponse.ok) {
      throw new Error(
        `UrbanLeaf API error for park ${parkId}: ${envResponse.status}`
      );
    }

    const envData = (await envResponse.json()) as EnvironmentalData;

    ctx.log(
      `[UrbanLeaf CRE] Park data: NDVI=${envData.ndvi}, PM2.5=${envData.pm25}, ` +
        `pop=${envData.affectedPopulation} (${envData.parkName})`
    );

    // -------------------------------------------------------------------------
    // Step 2: Call Gemini AI for urgency scoring
    // -------------------------------------------------------------------------
    const prompt = buildPrompt(envData);

    const geminiResponse = await http.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${ctx.secrets.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                score: { type: "INTEGER" },
                urgencyLevel: {
                  type: "STRING",
                  enum: ["Critical", "High", "Medium", "Low"],
                },
                insight: { type: "STRING" },
              },
              required: ["score", "urgencyLevel", "insight"],
            },
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiRaw = await geminiResponse.json();
    const ai = JSON.parse(
      geminiRaw.candidates[0].content.parts[0].text
    ) as {
      score: number;
      urgencyLevel: string;
      insight: string;
    };

    const score = Math.min(100, Math.max(0, Math.round(ai.score)));

    ctx.log(
      `[UrbanLeaf CRE] AI result: ${score}/100 (${ai.urgencyLevel}) — "${ai.insight}"`
    );

    // -------------------------------------------------------------------------
    // Step 3: Write score on-chain via setEnvironmentalScore()
    // -------------------------------------------------------------------------
    await evm.write({
      chainId: 421614,
      rpcUrl: ctx.secrets.ARBITRUM_SEPOLIA_RPC_URL,
      contractAddress: ctx.secrets.CONTRACT_ADDRESS,
      abi: [
        "function setEnvironmentalScore(uint64 proposalId, uint8 score, string memory urgencyLevel, string memory insight) external",
      ],
      functionName: "setEnvironmentalScore",
      args: [
        BigInt(proposalId.toString()),
        score,
        ai.urgencyLevel,
        ai.insight.substring(0, 256),
      ],
    });

    ctx.log(
      `[UrbanLeaf CRE] Score written on-chain for proposal #${proposalId}`
    );

    return {
      proposalId: proposalId.toString(),
      parkId,
      parkName: envData.parkName,
      aiScore: score,
      urgencyLevel: ai.urgencyLevel,
      insight: ai.insight,
      trigger: "evm-log",
      status: "scored",
    };
  },
});

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(env: EnvironmentalData): string {
  return `You are an environmental scientist AI scoring the urgency of a park protection proposal.

Park: ${env.parkName}
NDVI (vegetation health, 0-1 scale): ${env.ndvi}
PM2.5 air pollution (μg/m³): ${env.pm25}
Residents who lose green space access: ${env.affectedPopulation.toLocaleString()}
Projected vegetation loss: ${env.vegetationLossPercent}%
Projected air pollution increase: ${env.pm25IncreasePercent}%

Score the urgency of protecting this park from 0 to 100:
- 80-100 = Critical: immediate action required, severe environmental harm
- 60-79  = High: significant harm to many residents
- 40-59  = Medium: moderate impact, community should discuss
- 0-39   = Low: minor impact, standard review process adequate

Return JSON with:
- score: integer 0-100
- urgencyLevel: "Critical" | "High" | "Medium" | "Low"
- insight: single sentence (max 120 chars) explaining the key factor driving this score`;
}
