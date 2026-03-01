/**
 * UrbanLeaf AI — CRE Workflow: Automated Proposal Lifecycle Manager
 *
 * Trigger: Cron — runs daily at midnight UTC
 *
 * Flow:
 *   1. Fetch all active proposals from blockchain-service
 *   2. For each proposal past its endDate:
 *      a. Call Gemini AI for a closing summary
 *      b. POST to blockchain-service → updateProposalStatus() on Arbitrum Sepolia
 */

import {
  consensusIdenticalAggregation,
  cre,
  json,
  ok,
  type CronPayload,
  type HTTPSendRequester,
  Runner,
  type Runtime,
} from '@chainlink/cre-sdk'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

const configSchema = z.object({
  urbanleafApiUrl: z.string(),
  blockchainServiceUrl: z.string(),
})

type Config = z.infer<typeof configSchema>

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Proposal {
  id: number
  parkName: string
  endDate: number
  yesVotes: number
  noVotes: number
  status: string
  aiEnvironmentalScore: number
}

interface ClosedProposal {
  id: string
  outcome: string
  summary: string
}

// ---------------------------------------------------------------------------
// Auto-close pipeline
// ---------------------------------------------------------------------------

const runAutoClose = (
  sendRequester: HTTPSendRequester,
  blockchainServiceUrl: string,
  geminiApiKey: string,
): string => {
  const now = Math.floor(Date.now() / 1000)

  // Step 1: Get all active proposal IDs
  const idsRes = sendRequester
    .sendRequest({ method: 'GET', url: `${blockchainServiceUrl}/api/contract/proposals/active` })
    .result()

  if (!ok(idsRes)) {
    throw new Error(`Failed to fetch active proposals: ${idsRes.statusCode}`)
  }

  const { proposalIds } = json(idsRes) as { proposalIds: number[] }

  if (!proposalIds || proposalIds.length === 0) {
    return JSON.stringify({ closedCount: 0, message: 'No active proposals.' })
  }

  // Step 2: Fetch each proposal, find expired ones
  const expired: Proposal[] = []

  for (const id of proposalIds) {
    const propRes = sendRequester
      .sendRequest({ method: 'GET', url: `${blockchainServiceUrl}/api/contract/proposal/${id}` })
      .result()

    if (!ok(propRes)) continue

    const { proposal } = json(propRes) as { proposal: Proposal }
    if (proposal && proposal.endDate < now) {
      expired.push(proposal)
    }
  }

  if (expired.length === 0) {
    return JSON.stringify({ closedCount: 0, message: 'No expired proposals.' })
  }

  // Step 3: Close each expired proposal
  const closed: ClosedProposal[] = []

  for (const proposal of expired) {
    // Generate closing summary with Gemini
    const outcome = proposal.yesVotes > proposal.noVotes ? 'Accepted' : 'Declined'
    const summaryText = generateSummary(sendRequester, geminiApiKey, proposal, outcome)

    // Call blockchain-service to close on-chain
    const closeBody = JSON.stringify({ proposalId: proposal.id })
    const closeRes = sendRequester
      .sendRequest({
        method: 'POST',
        url: `${blockchainServiceUrl}/api/contract/close-proposal`,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(closeBody).toString('base64'),
      })
      .result()

    if (ok(closeRes)) {
      closed.push({ id: String(proposal.id), outcome, summary: summaryText })
    }
  }

  return JSON.stringify({ closedCount: closed.length, proposals: closed })
}

const generateSummary = (
  sendRequester: HTTPSendRequester,
  geminiApiKey: string,
  proposal: Proposal,
  outcome: string,
): string => {
  const prompt = `You are an UrbanLeaf AI assistant. A community park protection proposal has just closed.

Park: ${proposal.parkName}
Votes in favour: ${proposal.yesVotes}
Votes against: ${proposal.noVotes}
Outcome: ${outcome}
Environmental urgency score: ${proposal.aiEnvironmentalScore}/100

Write a single sentence (max 140 chars) summarising the outcome for the community newsletter.`

  try {
    const res = sendRequester
      .sendRequest({
        method: 'POST',
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(
          JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 80 },
          }),
        ).toString('base64'),
      })
      .result()

    if (ok(res)) {
      const data = json(res) as { candidates: { content: { parts: { text: string }[] } }[] }
      return (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().substring(0, 140)
    }
  } catch {
    // Fall through
  }

  return `Proposal for ${proposal.parkName} ${outcome.toLowerCase()} with ${proposal.yesVotes} yes / ${proposal.noVotes} no votes.`
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  runtime.log(`[UrbanLeaf CRE] Auto-close run at ${new Date().toISOString()}`)

  const geminiApiKey = runtime.getSecret({ id: 'GEMINI_API_KEY' }).result().value

  const httpClient = new cre.capabilities.HTTPClient()

  const result = httpClient
    .sendRequest(
      runtime,
      (sendRequester: HTTPSendRequester) =>
        runAutoClose(sendRequester, runtime.config.blockchainServiceUrl, geminiApiKey),
      consensusIdenticalAggregation<string>(),
    )()
    .result()

  runtime.log(`[UrbanLeaf CRE] Auto-close complete: ${result}`)
  return result
}

// ---------------------------------------------------------------------------
// Workflow entry point
// ---------------------------------------------------------------------------

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability()
  return [
    cre.handler(
      cron.trigger({ schedule: '0 0 * * *' }),
      onCronTrigger,
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema })
  await runner.run(initWorkflow)
}

main()
