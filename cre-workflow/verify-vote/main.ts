/**
 * UrbanLeaf AI — CRE Workflow: World ID Vote Verifier
 *
 * Trigger: HTTP POST /verify-vote
 *
 * This workflow bridges World ID sybil-resistance to Arbitrum Sepolia,
 * which does NOT natively support World ID on-chain verification.
 * CRE performs the off-chain proof verification via the World ID v4 API
 * using DON consensus, then calls the UrbanLeaf blockchain service to cast
 * a verified, sybil-resistant vote on Arbitrum Sepolia.
 *
 * Pipeline:
 *   1. Receive IDKit v4 result + rp_id from HTTP payload
 *   2. POST proof to World ID v4 Developer Portal verify API (off-chain within CRE)
 *   3. Extract nullifier from verified response
 *   4. POST to blockchain-service /api/contract/cast-verified-vote
 *      → calls voteVerified(proposalId, vote, voter, nullifier) on UrbanLeafCommunity.sol
 *   5. Return tx hash + nullifier
 *
 * Why CRE?
 *   - Arbitrum Sepolia has no native World ID contract
 *   - CRE's DON provides decentralised, consensus-based off-chain verification
 *   - The nullifier is stored on-chain after CRE confirms the proof is valid
 */

import {
  consensusIdenticalAggregation,
  cre,
  decodeJson,
  json,
  ok,
  text,
  type HTTPPayload,
  type HTTPSendRequester,
  Runner,
  type Runtime,
} from '@chainlink/cre-sdk'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

const configSchema = z.object({
  blockchainServiceUrl: z.string(),
  worldIdAction: z.string(),
})

type Config = z.infer<typeof configSchema>

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VoteVerifyPayload {
  proposalId: string
  vote: boolean
  voter: string
  idkitResult: object  // Full IDKit v4 result (IDKitResultV3 | IDKitResultV4)
  rp_id: string        // RP ID used to generate the rp_context
}

interface VerifyResult {
  proposalId: string
  voter: string
  vote: boolean
  nullifier: string
  txHash: string
  status: string
}

// ---------------------------------------------------------------------------
// Verification + vote pipeline (runs inside sendRequest node mode for DON consensus)
// ---------------------------------------------------------------------------

const runVerifyAndVote = (
  sendRequester: HTTPSendRequester,
  blockchainServiceUrl: string,
  payload: VoteVerifyPayload,
): VerifyResult => {
  const { proposalId, vote, voter, idkitResult, rp_id } = payload

  // Step 1: Verify World ID proof via v4 Developer Portal API (off-chain within CRE)
  // Arbitrum Sepolia has no native World ID contract — CRE bridges this gap.
  const verifyRes = sendRequester
    .sendRequest({
      method: 'POST',
      url: `https://developer.world.org/api/v4/verify/${rp_id}`,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify(idkitResult)).toString('base64'),
    })
    .result()

  if (!ok(verifyRes)) {
    const errBody = text(verifyRes)
    throw new Error(`World ID v4 verification failed (${verifyRes.statusCode}): ${errBody}`)
  }

  const verifyData = json(verifyRes) as { success: boolean; nullifier: string; detail?: string }

  if (!verifyData.success) {
    throw new Error(`World ID verification rejected: ${verifyData.detail || 'unknown error'}`)
  }

  const nullifier = verifyData.nullifier
  if (!nullifier) {
    throw new Error('World ID v4 API did not return a nullifier')
  }

  // Step 2: Cast the verified vote on Arbitrum Sepolia via blockchain service.
  // The nullifier is stored on-chain to prevent double-voting (sybil resistance).
  const voteBody = JSON.stringify({ proposalId, vote, voter, nullifier })

  const voteRes = sendRequester
    .sendRequest({
      method: 'POST',
      url: `${blockchainServiceUrl}/api/contract/cast-verified-vote`,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(voteBody).toString('base64'),
    })
    .result()

  if (!ok(voteRes)) {
    const errBody = text(voteRes)
    throw new Error(`On-chain vote failed (${voteRes.statusCode}): ${errBody}`)
  }

  const voteResult = json(voteRes) as { success: boolean; transactionHash: string }

  return {
    proposalId,
    voter,
    vote,
    nullifier,
    txHash: voteResult.transactionHash,
    status: 'verified_and_voted',
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const onHttpTrigger = (runtime: Runtime<Config>, httpPayload: HTTPPayload): string => {
  const payload = decodeJson(httpPayload.input) as VoteVerifyPayload

  runtime.log(
    `[UrbanLeaf CRE] World ID verify-vote → proposal #${payload.proposalId} | voter: ${payload.voter} | vote: ${payload.vote ? 'YES' : 'NO'} | rp_id: ${payload.rp_id}`,
  )

  const httpClient = new cre.capabilities.HTTPClient()

  const result = httpClient
    .sendRequest(
      runtime,
      (sendRequester: HTTPSendRequester) =>
        runVerifyAndVote(
          sendRequester,
          runtime.config.blockchainServiceUrl,
          payload,
        ),
      // DON consensus: all nodes must agree on the verification result
      consensusIdenticalAggregation<VerifyResult>(),
    )()
    .result()

  runtime.log(
    `[UrbanLeaf CRE] World ID verified on CRE → vote cast on Arbitrum Sepolia: txHash=${result.txHash} nullifier=${result.nullifier.slice(0, 18)}...`,
  )

  return JSON.stringify({ ...result, trigger: 'http', chain: 'arbitrum-sepolia' })
}

// ---------------------------------------------------------------------------
// Workflow entry point
// ---------------------------------------------------------------------------

const initWorkflow = (_config: Config) => {
  const http = new cre.capabilities.HTTPCapability()
  return [cre.handler(http.trigger({}), onHttpTrigger)]
}

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema })
  await runner.run(initWorkflow)
}

main()
