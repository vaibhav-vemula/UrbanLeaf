/**
 * UrbanLeaf AI — CRE Workflow: World ID Vote Verifier
 *
 * Trigger: HTTP POST /verify-vote
 *
 * This workflow bridges World ID sybil-resistance to Arbitrum Sepolia,
 * which does not natively support World ID. CRE performs the off-chain
 * proof verification via the World ID Developer Portal API, then calls
 * the UrbanLeaf blockchain service to cast a verified vote on-chain.
 *
 * Pipeline:
 *   1. Decode proposalId, vote, voter, and World ID proof from HTTP payload
 *   2. POST proof to World ID Developer Portal verify API (off-chain)
 *   3. On success → POST to blockchain-service /api/contract/vote-world-id
 *      which calls voteVerified() on UrbanLeafCommunity.sol
 *   4. Return tx hash + verification result
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

interface VotePayload {
  proposalId: string
  vote: boolean
  voter: string
  // World ID IDKit proof fields
  merkle_root: string
  nullifier_hash: string
  proof: string
  verification_level: string
}

interface VerifyResult {
  proposalId: string
  voter: string
  vote: boolean
  nullifierHash: string
  txHash: string
  status: string
}

// ---------------------------------------------------------------------------
// Verification + vote pipeline (runs inside sendRequest node mode)
// ---------------------------------------------------------------------------

const runVerifyAndVote = (
  sendRequester: HTTPSendRequester,
  blockchainServiceUrl: string,
  worldIdAppId: string,
  worldIdAction: string,
  payload: VotePayload,
): VerifyResult => {
  const { proposalId, vote, voter, merkle_root, nullifier_hash, proof, verification_level } = payload

  // Step 1: Verify World ID proof via Developer Portal API (off-chain)
  // Signal encodes proposalId + vote direction so the proof is tied to this specific vote
  const signal = `${proposalId}-${vote ? 'yes' : 'no'}`

  const verifyBody = JSON.stringify({
    merkle_root,
    nullifier_hash,
    proof,
    verification_level: verification_level || 'orb',
    action: worldIdAction,
    signal,
  })

  const verifyRes = sendRequester
    .sendRequest({
      method: 'POST',
      url: `https://developer.worldcoin.org/api/v2/verify/${worldIdAppId}`,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(verifyBody).toString('base64'),
    })
    .result()

  if (!ok(verifyRes)) {
    const errBody = text(verifyRes)
    throw new Error(`World ID verification failed (${verifyRes.statusCode}): ${errBody}`)
  }

  // Step 2: Cast the verified vote via blockchain service
  // The nullifier_hash is stored on-chain to prevent double-voting
  const voteBody = JSON.stringify({
    proposalId,
    vote,
    voter,
    nullifierHash: nullifier_hash,
  })

  const voteRes = sendRequester
    .sendRequest({
      method: 'POST',
      url: `${blockchainServiceUrl}/api/contract/vote-world-id`,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(voteBody).toString('base64'),
    })
    .result()

  if (!ok(voteRes)) {
    const errBody = text(voteRes)
    throw new Error(`Vote submission failed (${voteRes.statusCode}): ${errBody}`)
  }

  const voteResult = json(voteRes) as { success: boolean; transactionHash: string; explorerUrl: string }

  return {
    proposalId,
    voter,
    vote,
    nullifierHash: nullifier_hash,
    txHash: voteResult.transactionHash,
    status: 'verified_and_voted',
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const onHttpTrigger = (runtime: Runtime<Config>, httpPayload: HTTPPayload): string => {
  const payload = decodeJson(httpPayload.input) as VotePayload

  runtime.log(
    `[UrbanLeaf CRE] World ID vote verification → proposal #${payload.proposalId} | voter: ${payload.voter} | vote: ${payload.vote ? 'YES' : 'NO'}`,
  )

  const worldIdAppId = runtime.getSecret({ id: 'WORLD_ID_APP_ID' }).result().value

  const httpClient = new cre.capabilities.HTTPClient()

  const result = httpClient
    .sendRequest(
      runtime,
      (sendRequester: HTTPSendRequester) =>
        runVerifyAndVote(
          sendRequester,
          runtime.config.blockchainServiceUrl,
          worldIdAppId,
          runtime.config.worldIdAction,
          payload,
        ),
      consensusIdenticalAggregation<VerifyResult>(),
    )()
    .result()

  runtime.log(
    `[UrbanLeaf CRE] World ID vote verified and cast on-chain: ${result.txHash}`,
  )

  return JSON.stringify({ ...result, trigger: 'http' })
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
