/**
 * UrbanLeaf AI — CRE Workflow: Autonomous On-Chain Environmental Scorer
 *
 * Trigger: EVM Log — fires when ProposalCreated is emitted on Arbitrum Sepolia
 *
 * Pipeline:
 *   1. Decode proposalId + parkId from the ProposalCreated event
 *   2. Fetch live NDVI + air quality from UrbanLeaf FastAPI
 *   3. Gemini 2.0 Flash → urgency score (0-100) + level + insight
 *   4. runtime.report() → DON-signed report
 *   5. evmClient.writeReport() → calls onReport() on UrbanLeafCommunity.sol directly
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
import { decodeAbiParameters, encodeAbiParameters, parseAbiParameters } from 'viem'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

const configSchema = z.object({
  urbanleafApiUrl: z.string(),
  blockchainServiceUrl: z.string(),
  contractAddress: z.string(),
  chainSelectorName: z.string(),
  gasLimit: z.string(),
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
// Scoring pipeline (runs inside sendRequest node mode)
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
  const insight = ai.insight.substring(0, 256)

  // Write score directly to blockchain service so it lands on-chain in both
  // simulation mode (where writeReport is a no-op) and production.
  const setScoreBody = JSON.stringify({
    proposalId,
    score,
    urgencyLevel: ai.urgencyLevel,
    insight,
  })
  sendRequester
    .sendRequest({
      method: 'POST',
      url: `${blockchainServiceUrl}/api/contract/set-environmental-score`,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(setScoreBody).toString('base64'),
    })
    .result()

  return {
    proposalId,
    parkId,
    parkName: envData.parkName,
    aiScore: score,
    urgencyLevel: ai.urgencyLevel,
    insight,
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

  // Step 1+2: Fetch env data + Gemini score (DON consensus across nodes)
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
    `[UrbanLeaf CRE] Score computed: ${result.aiScore}/100 (${result.urgencyLevel}) — "${result.insight}"`,
  )

  // Step 3: ABI-encode the score for the on-chain report
  const reportData = encodeAbiParameters(
    parseAbiParameters('uint64 proposalId, uint8 score, string urgencyLevel, string insight'),
    [BigInt(proposalId), result.aiScore, result.urgencyLevel, result.insight.substring(0, 256)],
  )

  // Step 4: Generate DON-signed report
  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: 'evm',
      signingAlgo: 'ecdsa',
      hashingAlgo: 'keccak256',
    })
    .result()

  // Step 5: Submit report directly to the contract via Chainlink forwarder
  const network = getNetwork({
    chainFamily: 'evm',
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  })

  if (!network) {
    throw new Error(`Network not found: ${runtime.config.chainSelectorName}`)
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.contractAddress,
      report: reportResponse,
      gasConfig: { gasLimit: runtime.config.gasLimit },
    })
    .result()

  // In simulation mode writeReport returns a zero hash (no-op).
  // The score is already on-chain via the direct set-environmental-score call in runScoring().
  const txHash = bytesToHex(writeResult.txHash ?? new Uint8Array(32))
  const isSimulation = txHash === '0x' + '0'.repeat(64)

  runtime.log(
    isSimulation
      ? `[UrbanLeaf CRE] Score written on-chain via blockchain-service (simulation — writeReport is no-op)`
      : `[UrbanLeaf CRE] Score written on-chain via CRE forwarder: ${txHash}`,
  )

  return JSON.stringify({ ...result, txHash, trigger: 'evm-log', status: 'scored' })
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
