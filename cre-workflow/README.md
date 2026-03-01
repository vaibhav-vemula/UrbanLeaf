# UrbanLeaf CRE Workflows

Chainlink Runtime Environment workflows that make CRE the verifiable orchestration layer for all AI-driven governance in UrbanLeaf.

## Workflows

### 1. `evm-score-proposal` — Autonomous On-Chain Scorer (EVM Log Trigger)

**Trigger:** `ProposalCreated` event on Arbitrum Sepolia (chainId 421614)

The fully autonomous workflow. The CRE DON watches UrbanLeafCommunity.sol directly — no backend call needed. The instant a proposal is created on-chain, CRE decodes the event, runs the scoring pipeline, and writes the AI score back on-chain.

```
ProposalCreated event emitted on Arbitrum Sepolia
  ↓  [CRE EVM Log Trigger — no backend involved]
  Decode proposalId + parkId from event args
  → Fetch live NDVI + air quality from UrbanLeaf FastAPI
  → Gemini AI generates urgency score (0-100) + level + insight
  → Write score on-chain via UrbanLeafCommunity.setEnvironmentalScore()
```

### 2. `score-proposal` — Environmental Impact Scorer (HTTP Trigger)

**Trigger:** HTTP POST `/score-proposal`

Called by the UrbanLeaf backend when a user creates a park protection proposal via the AI agent. CRE orchestrates the full pipeline:

```
HTTP trigger (proposalId + parkId)
  → Fetch live NDVI + air quality from UrbanLeaf FastAPI
  → Gemini AI generates urgency score (0-100) + classification + insight
  → Write score on-chain via UrbanLeafCommunity.setEnvironmentalScore()
```

The result is a verifiable, AI-generated environmental urgency score stored permanently on Arbitrum Sepolia alongside every proposal.

### 2. `auto-close` — Automated Proposal Lifecycle Manager (Cron Trigger)

**Trigger:** Cron — daily at midnight UTC

Removes the need for a human operator to close proposals. CRE reads expired proposals from Arbitrum Sepolia, calls Gemini AI for closing summaries, and finalises each proposal on-chain.

```
Cron fires (midnight UTC)
  → Read all active proposals from Arbitrum Sepolia
  → Filter proposals past their voting deadline
  → Gemini AI generates closing summary for each
  → Call updateProposalStatus() on-chain for each expired proposal
```

## Setup

```bash
cp .env.example .env
# Fill in GEMINI_API_KEY, ARBITRUM_SEPOLIA_RPC_URL, CONTRACT_ADDRESS, PRIVATE_KEY

npm install
```

## Simulate

Install the CRE CLI: https://docs.chain.link/cre/getting-started/overview

```bash
# Simulate the EVM Log trigger workflow (autonomous on-chain scorer)
cre workflow simulate evm-score-proposal \
  --non-interactive \
  --trigger-index 0 \
  --evm-log-payload @./test/evm-proposal-created.json

# Simulate the HTTP trigger workflow (backend-initiated scorer)
cre workflow simulate score-proposal \
  --non-interactive \
  --trigger-index 0 \
  --http-payload @./test/score-proposal-payload.json

# Simulate the cron trigger workflow (daily auto-close)
cre workflow simulate auto-close \
  --non-interactive \
  --trigger-index 0
```

Or use the npm scripts:
```bash
npm run simulate:evm
npm run simulate:score
npm run simulate:autoclose
```

## Chainlink Integration Points

| Component | Integration |
|-----------|-------------|
| Blockchain | Arbitrum Sepolia — event watching, reads proposals, writes AI scores, closes proposals |
| External API | UrbanLeaf FastAPI — live NDVI satellite data + air quality from Google Earth Engine |
| AI Agent | Google Gemini 2.0 Flash — environmental urgency scoring + closing summaries |
| CRE Triggers | EVM Log (evm-score-proposal) + HTTP (score-proposal) + Cron daily (auto-close) |
