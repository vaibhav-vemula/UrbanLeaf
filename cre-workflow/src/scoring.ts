/**
 * Shared scoring pipeline used by both CRE workflows:
 *   - score-proposal  (HTTP trigger — backend-initiated)
 *   - evm-score-proposal  (EVM Log trigger — fully autonomous)
 */

import { http, evm } from "@chainlink/cre-sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnvironmentalData {
  ndvi: number;
  pm25: number;
  affectedPopulation: number;
  vegetationLossPercent: number;
  pm25IncreasePercent: number;
  parkName: string;
}

export interface ScoreResult {
  proposalId: string;
  parkId: string;
  parkName: string;
  aiScore: number;
  urgencyLevel: string;
  insight: string;
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

/**
 * Full scoring pipeline:
 *   1. Fetch live env data from UrbanLeaf API
 *   2. Call Gemini AI → urgency score + level + insight
 *   3. Write score on-chain via setEnvironmentalScore()
 */
export async function runScoringPipeline(
  ctx: any,
  proposalId: string,
  parkId: string
): Promise<ScoreResult> {

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
  const geminiResponse = await http.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${ctx.secrets.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(envData) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              score:        { type: "INTEGER" },
              urgencyLevel: { type: "STRING", enum: ["Critical", "High", "Medium", "Low"] },
              insight:      { type: "STRING" },
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
  const ai = JSON.parse(geminiRaw.candidates[0].content.parts[0].text) as {
    score: number;
    urgencyLevel: string;
    insight: string;
  };

  const score = Math.min(100, Math.max(0, Math.round(ai.score)));

  ctx.log(
    `[UrbanLeaf CRE] AI result: ${score}/100 (${ai.urgencyLevel}) — "${ai.insight}"`
  );

  // -------------------------------------------------------------------------
  // Step 3: Write score on-chain
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
      BigInt(proposalId),
      score,
      ai.urgencyLevel,
      ai.insight.substring(0, 256),
    ],
  });

  ctx.log(`[UrbanLeaf CRE] Score written on-chain for proposal #${proposalId}`);

  return {
    proposalId,
    parkId,
    parkName: envData.parkName,
    aiScore: score,
    urgencyLevel: ai.urgencyLevel,
    insight: ai.insight,
  };
}

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
