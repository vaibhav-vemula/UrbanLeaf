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
# Fill in keys for all three workflows (one .env covers all)
cp .env.example .env

# Install deps for all workflow projects
npm run install:all
```

## Structure

Each workflow is its own CRE project folder (required by the CRE CLI):

```
cre-workflow/
├── evm-score-proposal/   # Workflow 1 — EVM Log trigger
│   ├── workflow.yaml
│   ├── package.json
│   └── src/workflow.ts
├── score-proposal/        # Workflow 2 — HTTP trigger
│   ├── workflow.yaml
│   ├── package.json
│   └── src/workflow.ts
└── auto-close/            # Workflow 3 — Cron trigger
    ├── workflow.yaml
    ├── package.json
    └── src/workflow.ts
```

## Simulate

Install the CRE CLI: https://docs.chain.link/cre/getting-started/overview

**The backend auto-updates the test payloads** every time a proposal is created via the
frontend — `test/score-proposal-payload.json` and `test/last-tx-hash.txt` are kept in sync.
Just create a proposal, then run the simulate command you want.

Run all simulate commands from the `cre-workflow/` directory.

```bash
# Workflow 2 — HTTP trigger
# test/score-proposal-payload.json is auto-updated when a proposal is created
npm run simulate:score

# Workflow 1 — EVM Log trigger
# test/last-tx-hash.txt is auto-updated when a proposal is created
npm run simulate:evm

# Workflow 3 — Cron trigger
npm run simulate:autoclose
```

Note: each script `cd`s into the workflow subfolder before running — the CRE CLI requires
`workflow.yaml` to be present in the current (or a parent) directory.

## Chainlink Integration Points

| Component | Integration |
|-----------|-------------|
| Blockchain | Arbitrum Sepolia — event watching, reads proposals, writes AI scores, closes proposals |
| External API | UrbanLeaf FastAPI — live NDVI satellite data + air quality from Google Earth Engine |
| AI Agent | Google Gemini 2.0 Flash — environmental urgency scoring + closing summaries |
| CRE Triggers | EVM Log (evm-score-proposal) + HTTP (score-proposal) + Cron daily (auto-close) |
