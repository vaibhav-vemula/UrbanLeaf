/**
 * UrbanLeaf AI — CRE Workflow: Autonomous On-Chain Environmental Scorer
 *
 * Trigger: EVM Log — fires when ProposalCreated is emitted on Arbitrum Sepolia
 *
 * The fully autonomous workflow. The CRE DON watches UrbanLeafCommunity.sol
 * directly. The moment a proposal is created on-chain, CRE decodes the event,
 * scores it with Gemini AI, and writes the result back on-chain.
 *
 * Event: ProposalCreated(uint64 indexed proposalId, string parkName,
 *                        string parkId, uint256 endDate, string creatorAccountId)
 */

import {
  bytesToHex,
  consensusIdenticalAggregation,
  cre,
  type EVMLog,
  getNetwork,
  hexToBase64,
  json,
  ok,
  type HTTPSendRequester,
  Runner,
  type Runtime,
} from '@chainlink/cre-sdk'
import { decodeAbiParameters } from 'viem'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

const configSchema = z.object({
  urbanleafApiUrl: z.string(),
  blockchainServiceUrl: z.string(),
  contractAddress: z.string(),
  chainSelectorName: z.string(),
})

type Config = z.infer<typeof configSchema>

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnvironmentalData {
  ndvi: number
  pm25: number
  affectedPopulation: number
  vegetationLossPercent: number
  pm25IncreasePercent: number
  parkName: string
}

interface ScoringResult {
  proposalId: string
  parkId: string
  parkName: string
  aiScore: number
  urgencyLevel: string
  insight: string
}

// ---------------------------------------------------------------------------
// Scoring pipeline
// ---------------------------------------------------------------------------

const runScoring = (
  sendRequester: HTTPSendRequester,
  urbanleafApiUrl: string,
  blockchainServiceUrl: string,
  geminiApiKey: string,
  proposalId: string,
  parkId: string,
): ScoringResult => {
  // Step 1: Fetch env data
  const envRes = sendRequester
    .sendRequest({ method: 'GET', url: `${urbanleafApiUrl}/api/park-environmental-data/${parkId}` })
    .result()

  if (!ok(envRes)) {
    throw new Error(`UrbanLeaf API error: ${envRes.statusCode}`)
  }

  const envData = json(envRes) as EnvironmentalData

  // Step 2: Gemini AI scoring
  const geminiBody = JSON.stringify({
    contents: [{ parts: [{ text: buildPrompt(envData) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          score: { type: 'INTEGER' },
          urgencyLevel: { type: 'STRING', enum: ['Critical', 'High', 'Medium', 'Low'] },
          insight: { type: 'STRING' },
        },
        required: ['score', 'urgencyLevel', 'insight'],
      },
    },
  })

  const geminiRes = sendRequester
    .sendRequest({
      method: 'POST',
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(geminiBody).toString('base64'),
    })
    .result()

  if (!ok(geminiRes)) {
    throw new Error(`Gemini API error: ${geminiRes.statusCode}`)
  }

  const geminiData = json(geminiRes) as { candidates: { content: { parts: { text: string }[] } }[] }
  const ai = JSON.parse(geminiData.candidates[0].content.parts[0].text) as {
    score: number
    urgencyLevel: string
    insight: string
  }

  const score = Math.min(100, Math.max(0, Math.round(ai.score)))

  // Step 3: Write score via blockchain-service
  const writeBody = JSON.stringify({
    proposalId,
    score,
    urgencyLevel: ai.urgencyLevel,
    insight: ai.insight.substring(0, 256),
  })

  const writeRes = sendRequester
    .sendRequest({
      method: 'POST',
      url: `${blockchainServiceUrl}/api/contract/set-environmental-score`,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(writeBody).toString('base64'),
    })
    .result()

  if (!ok(writeRes)) {
    throw new Error(`Blockchain service error: ${writeRes.statusCode}`)
  }

  return {
    proposalId,
    parkId,
    parkName: envData.parkName,
    aiScore: score,
    urgencyLevel: ai.urgencyLevel,
    insight: ai.insight,
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const onLogTrigger = (runtime: Runtime<Config>, payload: EVMLog): string => {
  // Decode proposalId from topics[1] (indexed uint64, ABI-padded to 32 bytes)
  const proposalId = BigInt('0x' + Buffer.from(payload.topics[1]).toString('hex')).toString()

  // Decode non-indexed params from data: (string parkName, string parkId, uint256 endDate, string creatorAccountId)
  const dataHex = bytesToHex(payload.data)
  const [parkName, parkId] = decodeAbiParameters(
    [
      { type: 'string', name: 'parkName' },
      { type: 'string', name: 'parkId' },
      { type: 'uint256', name: 'endDate' },
      { type: 'string', name: 'creatorAccountId' },
    ],
    dataHex,
  )

  runtime.log(
    `[UrbanLeaf CRE] EVM Log trigger → ProposalCreated #${proposalId} | park: "${parkName}" (${parkId})`,
  )

  const geminiApiKey = runtime.getSecret({ id: 'GEMINI_API_KEY' }).result().value

  const httpClient = new cre.capabilities.HTTPClient()

  const result = httpClient
    .sendRequest(
      runtime,
      (sendRequester: HTTPSendRequester) =>
        runScoring(
          sendRequester,
          runtime.config.urbanleafApiUrl,
          runtime.config.blockchainServiceUrl,
          geminiApiKey,
          proposalId,
          parkId,
        ),
      consensusIdenticalAggregation<ScoringResult>(),
    )()
    .result()

  runtime.log(
    `[UrbanLeaf CRE] Score written on-chain: ${result.aiScore}/100 (${result.urgencyLevel}) — "${result.insight}"`,
  )

  return JSON.stringify({ ...result, trigger: 'evm-log', status: 'scored' })
}

// ---------------------------------------------------------------------------
// Workflow entry point
// ---------------------------------------------------------------------------

const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: 'evm',
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })

  if (!network) {
    throw new Error(`Network not found: ${config.chainSelectorName}`)
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)

  return [
    cre.handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.contractAddress)],
      }),
      onLogTrigger,
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema })
  await runner.run(initWorkflow)
}

main()

// ---------------------------------------------------------------------------
// Helpers
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
- insight: single sentence (max 120 chars) explaining the key factor driving this score`
}
