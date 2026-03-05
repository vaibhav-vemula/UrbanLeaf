# UrbanLeaf AI

### Decentralizing Urban City Planning and Governance Through AI & Blockchain

**Demo Video:** [https://youtu.be/20KxExztAsc](https://youtu.be/20KxExztAsc)

---

## Chainlink CRE Files

| File | Purpose |
|---|---|
| [`cre-workflow/score-proposal/main.ts`](cre-workflow/score-proposal/main.ts) | HTTP trigger — AI scores proposal with Gemini via DON consensus |
| [`cre-workflow/evm-score-proposal/main.ts`](cre-workflow/evm-score-proposal/main.ts) | EVM log trigger — autonomous scoring on `ProposalCreated` event |
| [`cre-workflow/auto-close/main.ts`](cre-workflow/auto-close/main.ts) | Cron trigger — closes expired proposals daily at midnight UTC |
| [`cre-workflow/verify-vote/main.ts`](cre-workflow/verify-vote/main.ts) | HTTP trigger — World ID v4 proof verification via DON consensus |
| [`cre-workflow/score-proposal/workflow.yaml`](cre-workflow/score-proposal/workflow.yaml) | Workflow config for score-proposal |
| [`cre-workflow/evm-score-proposal/workflow.yaml`](cre-workflow/evm-score-proposal/workflow.yaml) | Workflow config for evm-score-proposal |
| [`cre-workflow/auto-close/workflow.yaml`](cre-workflow/auto-close/workflow.yaml) | Workflow config for auto-close |
| [`cre-workflow/verify-vote/workflow.yaml`](cre-workflow/verify-vote/workflow.yaml) | Workflow config for verify-vote |
| [`backend/blockchain-service/src/services/blockchain-service.js`](backend/blockchain-service/src/services/blockchain-service.js) | Blockchain service — called by CRE workflows to write results on-chain |
| [`backend/blockchain-service/contracts/UrbanLeafCommunity.sol`](backend/blockchain-service/contracts/UrbanLeafCommunity.sol) | Smart contract — receives CRE DON reports via `onReport()` |

## World ID Files

| File | Purpose |
|---|---|
| [`cre-workflow/verify-vote/main.ts`](cre-workflow/verify-vote/main.ts) | CRE workflow — each DON node verifies World ID v4 ZK proof independently |
| [`backend/blockchain-service/src/routes/contract.js`](backend/blockchain-service/src/routes/contract.js) | Backend routes — `GET /world-id/request` (signed rp_context) and `POST /vote-world-id` |
| [`backend/blockchain-service/contracts/UrbanLeafCommunity.sol`](backend/blockchain-service/contracts/UrbanLeafCommunity.sol) | Smart contract — `voteVerified()` with nullifier-based sybil resistance |
| [`frontend/app/proposal/page.tsx`](frontend/app/proposal/page.tsx) | Frontend — `IDKitRequestWidget` controlled mode, World ID voting UI |

---

UrbanLeaf lets government professionals submit development proposals for park land, and lets nearby residents vote on them with World ID verified, sybil-resistant votes. Proposals are automatically scored by Gemini AI via Chainlink CRE DON consensus, and expired proposals are closed automatically by a daily cron workflow.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Chainlink CRE Integration](#chainlink-cre-integration)
  - [Workflow 1 — HTTP Score Trigger](#workflow-1--http-score-trigger-score-proposal)
  - [Workflow 2 — EVM Log Score Trigger](#workflow-2--evm-log-score-trigger-evm-score-proposal)
  - [Workflow 3 — Auto-Close Cron](#workflow-3--auto-close-cron-auto-close)
  - [Workflow 4 — World ID Vote Verification](#workflow-4--world-id-vote-verification-verify-vote)
  - [CRE Data Flow](#cre-data-flow)
- [World ID Integration](#world-id-integration)
  - [Why World ID on Arbitrum Sepolia](#why-world-id-on-arbitrum-sepolia)
  - [v4 Protocol Flow](#v4-protocol-flow)
  - [Sybil Resistance on Contract](#sybil-resistance-on-contract)
- [Smart Contract](#smart-contract)
- [USDC Fundraising](#usdc-fundraising)
- [Setup Instructions](#setup-instructions)
  - [Prerequisites](#prerequisites)
  - [1 — Clone and Environment](#1--clone-and-environment)
  - [2 — Backend (FastAPI)](#2--backend-fastapi)
  - [3 — Blockchain Service](#3--blockchain-service)
  - [4 — Deploy Smart Contract](#4--deploy-smart-contract)
  - [5 — CRE Workflows](#5--cre-workflows)
  - [6 — Frontend](#6--frontend)
  - [7 — Running Everything](#7--running-everything)
- [Simulating CRE Workflows Locally](#simulating-cre-workflows-locally)
- [Project Structure](#project-structure)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js 15)                   │
│   Mapbox map · Wallet (MetaMask) · Proposals · World ID IDKit   │
└─────────────┬──────────────────────────────┬───────────────────┘
              │ REST                          │ REST
              ▼                              ▼
┌─────────────────────┐          ┌───────────────────────────────┐
│   Backend (FastAPI) │          │  Blockchain Service (Node.js)  │
│   port 4000         │          │  port 5000                     │
│                     │          │                                │
│  • AI agent         │          │  • ethers.js contract calls    │
│  • Park NDVI data   │◄─────────│  • CRE workflow runner         │
│  • Gemini 2.0 Flash │  HTTP    │  • World ID v4 verify          │
│  • Supabase parks   │          │  • USDC donation flow          │
│  • Email notify     │          └──────────────┬────────────────┘
└─────────────────────┘                         │
         ▲                                      │ ethers.js
         │ HTTP (CRE → Backend)                 ▼
         │                       ┌──────────────────────────────┐
┌────────┴──────────────────┐    │  UrbanLeafCommunity.sol      │
│  Chainlink CRE Workflows  │    │  Arbitrum Sepolia            │
│                           │    │                              │
│  score-proposal (HTTP)    │    │  • createProposal()          │
│  evm-score-proposal (EVM) │───►│  • vote() / voteVerified()   │
│  auto-close (Cron)        │    │  • setEnvironmentalScore()   │
│  verify-vote (HTTP+WorldID│    │  • updateProposalStatus()    │
│                           │    │  • donateToProposal() (USDC) │
│  DON consensus on all 4   │    └──────────────────────────────┘
└───────────────────────────┘
```

**Stack:** Next.js 15 · FastAPI · Node.js/Express · Solidity · Chainlink CRE SDK v1.x · World ID v4 · Gemini 2.0 Flash · Mapbox · Supabase · USDC (Arbitrum Sepolia)

---

## Chainlink CRE Integration

UrbanLeaf uses four CRE workflows covering three trigger types: HTTP, EVM log, and Cron. Every workflow runs under DON (Decentralized Oracle Network) consensus — results are only written on-chain when a threshold of CRE nodes agree on identical outputs.

### Workflow 1 — HTTP Score Trigger (`score-proposal`)

**Trigger:** HTTP POST
**Purpose:** Score a proposal with Gemini AI immediately after creation (backend-initiated path)

When the backend creates a proposal on-chain, it writes the `proposalId` and `parkId` to a JSON payload file and invokes this workflow. The workflow:

1. Receives `{ proposalId, parkId }` via HTTP trigger
2. Calls `GET /api/park-environmental-data/{parkId}` on the FastAPI backend to retrieve live satellite data (NDVI, PM2.5, vegetation loss %, affected population)
3. Sends the environmental data to **Gemini 2.0 Flash** with a structured JSON schema requesting:
   - `score` (0–100 urgency integer)
   - `urgencyLevel` — `"Critical"` | `"High"` | `"Medium"` | `"Low"`
   - `insight` — one-line human-readable summary
4. Calls `POST /api/contract/set-environmental-score` on the blockchain service to write the score on-chain
5. ABI-encodes the result as `(uint64 proposalId, uint8 score, string urgencyLevel, string insight)` and submits it as a DON report via `EVMClient.writeReport()`

All steps run inside `consensusIdenticalAggregation<ScoringResult>()` — every CRE node independently calls Gemini and the results must be identical before the report is committed.

```
Backend creates proposal → writes payload JSON
       ↓
cre workflow simulate score-proposal
       ↓
CRE fetches env data from FastAPI  GET /api/park-environmental-data/{parkId}
       ↓
CRE calls Gemini 2.0 Flash → { score, urgencyLevel, insight }
       ↓
CRE calls blockchain-service  POST /api/contract/set-environmental-score
       ↓
DON report written via EVMClient.writeReport()
       ↓
Frontend shows urgency badge (Critical 🔴 / High 🟠 / Medium 🟡 / Low 🟢)
```

### Workflow 2 — EVM Log Score Trigger (`evm-score-proposal`)

**Trigger:** EVM Log — watches `ProposalCreated` event
**Purpose:** Fully autonomous on-chain scoring — no backend involvement needed after contract deployment

This workflow watches the contract's `ProposalCreated` event directly via CRE's `EVMClient.logTrigger()`. When the event fires, the workflow:

1. Decodes `proposalId` from `topics[1]` (ABI-encoded indexed `uint64`)
2. Decodes non-indexed params `(parkName, parkId, endDate, creatorAccountId)` from `payload.data` using viem's `decodeAbiParameters`
3. Runs the identical Gemini scoring pipeline as Workflow 1

```typescript
// Event decoding inside each CRE worker node
const proposalId = BigInt('0x' + Buffer.from(payload.topics[1]).toString('hex')).toString()

const [parkName, parkId] = decodeAbiParameters(
  [
    { type: 'string', name: 'parkName' },
    { type: 'string', name: 'parkId' },
    { type: 'uint256', name: 'endDate' },
    { type: 'string', name: 'creatorAccountId' },
  ],
  bytesToHex(payload.data)
)
```

The EVM workflow is the **production path** — once deployed to the CRE network, every new proposal is scored automatically with zero human intervention.

```
ProposalCreated event emitted on Arbitrum Sepolia
       ↓
CRE DON detects log via logTrigger({ addresses: [contractAddress] })
       ↓
Each node independently decodes proposalId + parkId from event data
       ↓
Same Gemini scoring pipeline as Workflow 1
       ↓
DON consensus → score written on-chain
```

### Workflow 3 — Auto-Close Cron (`auto-close`)

**Trigger:** Cron — `0 0 * * *` (daily at 00:00 UTC)
**Purpose:** Automatically finalize proposals whose voting period has ended

Each day at midnight UTC the workflow:

1. `GET /api/contract/proposals/active` → fetches all active proposal IDs
2. For each ID: `GET /api/contract/proposal/{id}` → checks if `endDate < now`
3. For each expired proposal, calls Gemini to generate a 140-character closing summary:
   ```
   Park: {parkName}
   Votes in favour: {yesVotes} | Votes against: {noVotes}
   Outcome: Accepted / Declined
   Environmental urgency score: {score}/100

   Write a single sentence (max 140 chars) summarising the outcome for the community newsletter.
   ```
4. `POST /api/contract/close-proposal` → calls `updateProposalStatus()` on-chain
   - `yesVotes > noVotes` → `Accepted` (and sets `fundingEnabled = true` if a goal was set)
   - Otherwise → `Declined`
5. Returns `{ closedCount, proposals: [{ id, outcome, summary }] }` under DON consensus

```
Cron fires at 00:00 UTC
       ↓
Fetch all active proposal IDs from blockchain service
       ↓
Filter: proposals where endDate < now
       ↓
For each expired proposal:
  Gemini → 140-char community newsletter summary
  POST /close-proposal → updateProposalStatus() on-chain
       ↓
Proposal status: Active → Accepted or Declined
Accepted + fundingGoal > 0 → fundingEnabled = true (USDC donations open)
```

### Workflow 4 — World ID Vote Verification (`verify-vote`)

**Trigger:** HTTP POST
**Purpose:** Verify World ID v4 proofs off-chain with DON consensus, then cast sybil-resistant votes on Arbitrum Sepolia

This is the **World ID + CRE integration** workflow. Since World ID's on-chain Semaphore verifier is not deployed on Arbitrum Sepolia, CRE acts as the off-chain verifier — each DON node independently calls the World ID v4 REST API and consensus provides the equivalent trust guarantee.

1. Receives `{ proposalId, vote, voter, idkitResult, rp_id }` from the backend
2. Each CRE node calls `POST https://developer.world.org/api/v4/verify/{rp_id}` with the IDKit proof
3. Extracts the top-level `nullifier` from the verified response
4. `POST /api/contract/cast-verified-vote` → calls `voteVerified(proposalId, vote, voter, nullifier)` on-chain
5. Contract records the vote and marks the nullifier as used to prevent replay

```typescript
// Inside the CRE verify-vote workflow (runs on every DON node)
const verifyRes = await http.post(`https://developer.world.org/api/v4/verify/${rp_id}`, {
  ...idkitResult,
  action: config.worldIdAction,
  signal: `${proposalId}-${vote ? 'yes' : 'no'}`,
})
const { success, nullifier } = json(verifyRes)
if (!success) throw new Error('World ID verification rejected')

// Cast the verified vote on-chain
await http.post(`${config.blockchainServiceUrl}/api/contract/cast-verified-vote`, {
  proposalId, vote, voter, nullifier
})
```

### CRE Data Flow

```
                    ┌──────────────────────┐
                    │  FastAPI Backend      │
                    │  :4000                │
                    │                       │
                    │  GET /api/park-       │ ◄── score-proposal
                    │      environmental-   │ ◄── evm-score-proposal
                    │      data/{parkId}    │
                    └──────────────────────┘

                    ┌──────────────────────┐
                    │  Blockchain Service   │
                    │  :5000                │
                    │                       │
                    │  POST /set-env-score  │ ◄── score-proposal, evm-score-proposal
                    │  POST /close-proposal │ ◄── auto-close
                    │  POST /cast-verified- │ ◄── verify-vote
                    │       vote            │
                    └──────────────────────┘

                    ┌──────────────────────┐
                    │  World ID v4 API      │
                    │  developer.world.org  │
                    │                       │
                    │  POST /v4/verify/     │ ◄── verify-vote (each DON node)
                    │       {rp_id}         │
                    └──────────────────────┘
```

---

## World ID Integration

### Why World ID on Arbitrum Sepolia

World ID's on-chain Semaphore verifier contract is not deployed on Arbitrum Sepolia. UrbanLeaf solves this by using **Chainlink CRE as the off-chain verification layer**: the `verify-vote` workflow calls the World ID v4 REST API from each DON node, and DON consensus provides the trust guarantee that replaces on-chain verification.

This enables fully sybil-resistant governance on Arbitrum Sepolia — a chain World ID does not natively support — without any trusted intermediary.

### v4 Protocol Flow

```
1. User clicks "Vote with World ID" on the proposal page
         ↓
2. Frontend → GET /api/contract/world-id/request?action=urbanleaf-vote
   Backend: signRequest(action, signingKey) using @worldcoin/idkit-core
   Response: { rp_context: { rp_id, nonce, created_at, expires_at, signature } }
         ↓
3. Frontend opens IDKitRequestWidget (deviceLegacy preset, controlled mode)
   User scans QR code with World App
   World App returns IDKit v4 result:
   { proof, merkle_root, nullifier_hash, verification_level, ... }
         ↓
4. Frontend → POST /api/contract/vote-world-id
   { proposalId, vote, voter, idkitResult, rp_id }
         ↓
5. Blockchain Service spawns CRE verify-vote workflow
         ↓
6. Each CRE DON node independently:
   POST https://developer.world.org/api/v4/verify/{rp_id}
   with { ...idkitResult, action: "urbanleaf-vote", signal: "{proposalId}-yes/no" }
         ↓
7. World ID API returns { success: true, nullifier: "0x..." }
         ↓
8. DON consensus: all nodes agree on the same nullifier value
         ↓
9. CRE → POST /api/contract/cast-verified-vote
   { proposalId, vote, voter, nullifier }
         ↓
10. Blockchain Service → contract.voteVerified(proposalId, vote, voter, nullifier)
         ↓
11. Contract: usedNullifiers[proposalId][nullifier] = true → vote recorded
```

### Sybil Resistance on Contract

```solidity
// One nullifier per (proposalId, human identity) — prevents double-voting per proposal
mapping(uint64 => mapping(uint256 => bool)) public usedNullifiers;

function voteVerified(
    uint64 proposalId,
    bool voteValue,
    address voter,
    uint256 nullifierHash
) public onlyOwner proposalExists(proposalId) proposalActive(proposalId) {
    require(!usedNullifiers[proposalId][nullifierHash], "World ID: nullifier already used");
    require(!hasVoted[proposalId][voter], "User has already voted");

    usedNullifiers[proposalId][nullifierHash] = true;
    // ... record vote and emit VoteCast + HumanVoteCast events
}
```

**Per-proposal scoping:** A user can vote on multiple proposals (different `proposalId`) but cannot vote twice on the same one. The nullifier is scoped to each proposal, matching World ID's "one person, one vote per action" model.

**Signal binding:** The World ID signal is `{proposalId}-yes` or `{proposalId}-no`. This binds the proof cryptographically to the specific proposal and vote direction — a proof generated for proposal #1 YES cannot be replayed as proposal #2 NO or as a NO vote on the same proposal.

---

## Smart Contract

**Address:** `0x3E4E04cA566698Ae4886196c201cBEE3CD45A126`
**Network:** Arbitrum Sepolia (chainId 421614)
**Explorer:** https://sepolia.arbiscan.io/address/0x3E4E04cA566698Ae4886196c201cBEE3CD45A126

| Function | Caller | Purpose |
|---|---|---|
| `createProposal(...)` | Anyone | Create a park protection proposal |
| `vote(proposalId, vote, voter)` | Backend | Regular vote (no sybil check) |
| `voteVerified(proposalId, vote, voter, nullifier)` | Owner (CRE) | World ID sybil-resistant vote |
| `setEnvironmentalScore(id, score, urgency, insight)` | Owner (CRE) | Write Gemini AI score on-chain |
| `onReport(metadata, report)` | CRE Forwarder | DON-attested ABI report (production) |
| `updateProposalStatus(proposalId)` | Owner (CRE) | Finalize after voting ends |
| `forceCloseProposal(proposalId, status)` | Owner | Admin early close |
| `donateToProposal(proposalId, amount)` | Anyone | Donate USDC to accepted proposal |
| `withdrawFunds(proposalId, recipient)` | Owner | Withdraw USDC to recipient |

**CRE Forwarder (Arbitrum Sepolia simulation):** `0xd41263567ddfead91504199b8c6c87371e83ca5d`

---

## USDC Fundraising

Fundraising uses **USDC** (ERC-20, 6 decimals) for stable-value community funding.

**USDC on Arbitrum Sepolia:** `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`

The donation flow requires two MetaMask confirmations:

```
1. usdc.approve(CONTRACT_ADDRESS, amount)     ← approve USDC spend
2. contract.donateToProposal(id, amount)      ← USDC transferred to contract
```

When a proposal with a funding goal is Accepted, `fundingEnabled` is set to `true` automatically by the auto-close CRE workflow. Amounts are stored and displayed in USDC units (6 decimal places, displayed with 2 decimal places).

---

## Setup Instructions

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | >= 20 | |
| Python | >= 3.11 | |
| Bun | latest | For CRE workflow deps |
| MetaMask | latest | Browser extension |
| CRE CLI | latest | See install below |

**Install CRE CLI:**
```bash
curl -sSL https://install.cre.network | bash
# Adds ~/.cre/bin/cre to PATH
echo 'export PATH="$HOME/.cre/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
cre --version
```

**Get Arbitrum Sepolia ETH (for gas):**
https://faucet.triangleplatform.com/arbitrum/sepolia

**Get Arbitrum Sepolia USDC (for testing donations):**
https://faucet.circle.com — select "Arbitrum Sepolia"

---

### 1 — Clone and Environment

```bash
git clone <repo-url>
cd UrbanLeaf
```

---

### 2 — Backend (FastAPI)

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:
```env
GEMINI_API_KEY=<your-gemini-api-key>
GEE_PROJECT_ID=<your-google-earth-engine-project>
BLOCKCHAIN_SERVICE_URL=http://localhost:5000
SUPABASE_URL=<your-supabase-url>
SUPABASE_KEY=<your-supabase-anon-key>
PORT=4000

# Optional — proposal email notifications
SENDGRID_API_KEY=<your-sendgrid-api-key>
```

Get a Gemini API key: https://aistudio.google.com/apikey
Set up a Supabase project: https://supabase.com

---

### 3 — Blockchain Service

```bash
cd backend/blockchain-service
npm install
```

Create `backend/blockchain-service/.env`:
```env
PORT=5000
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Your deployer wallet private key (no 0x prefix)
PRIVATE_KEY=<your-private-key>

# Filled in after Step 4
CONTRACT_ADDRESS=

# World ID — create app at https://developer.worldcoin.org
# Create action: urbanleaf-vote
WORLD_ID_APP_ID=app_<your-app-id>
WORLD_ID_RP_ID=rp_<your-rp-id>
WORLD_ID_SIGNING_KEY=<32-byte-hex-signing-key>
```

**World ID setup:**
1. Go to https://developer.worldcoin.org → create an app
2. Add action named exactly `urbanleaf-vote`
3. Under "Sign In with World ID" → create an RP, copy the `rp_id`
4. Generate a 32-byte hex signing key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
5. Register the corresponding public key in the World ID developer portal

---

### 4 — Deploy Smart Contract

```bash
cd backend/blockchain-service
npm run compile
node scripts/deploy-contract.js
```

The script prints the new contract address. Update it in three places:

```bash
# backend/blockchain-service/.env
CONTRACT_ADDRESS=0x<new-address>
```

```bash
# frontend/.env.local
NEXT_PUBLIC_CONTRACT_ADDRESS=0x<new-address>
```

```bash
# cre-workflow/score-proposal/config.staging.json
# cre-workflow/evm-score-proposal/config.staging.json
{
  "contractAddress": "0x<new-address>",
  ...
}
```

---

### 5 — CRE Workflows

```bash
cd cre-workflow

# Install root deps
bun install

# Install deps for each workflow
cd score-proposal    && bun install && cd ..
cd evm-score-proposal && bun install && cd ..
cd auto-close        && bun install && cd ..
cd verify-vote       && bun install && cd ..
```

Create `cre-workflow/.env`:
```env
CRE_TARGET=staging-settings

# Same private key as blockchain-service (the CRE worker wallet — must be the contract owner)
CRE_ETH_PRIVATE_KEY=0x<your-private-key>

# Gemini API key for CRE scoring workers
GEMINI_API_KEY=<your-gemini-api-key>
```

Create `cre-workflow/secrets.yaml`:
```yaml
secrets:
  - id: GEMINI_API_KEY
    value: <your-gemini-api-key>
```

Verify `cre-workflow/project.yaml` has the correct Arbitrum Sepolia RPC:
```yaml
staging-settings:
  rpcs:
    - chain-name: ethereum-testnet-sepolia-arbitrum-1
      url: https://sepolia-rollup.arbitrum.io/rpc
```

---

### 6 — Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_BLOCKCHAIN_SERVICE_URL=http://localhost:5000
NEXT_PUBLIC_CONTRACT_ADDRESS=0x<deployed-address>

# World ID — must match your developer.worldcoin.org app ID
NEXT_PUBLIC_WORLD_ID_APP_ID=app_<your-app-id>

# Optional: CRE verify-vote HTTP trigger URL for production CRE path
# Leave empty for local dev (falls back to direct backend verification)
# NEXT_PUBLIC_CRE_VERIFY_URL=https://your-cre-endpoint/verify-vote

# Mapbox — create a free token at https://mapbox.com
NEXT_PUBLIC_MAPBOX_TOKEN=pk.<your-mapbox-token>

# Supabase
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_KEY=<your-supabase-anon-key>
```

---

### 7 — Running Everything

Open four terminal tabs:

**Tab 1 — FastAPI backend:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 4000
```

**Tab 2 — Blockchain service:**
```bash
cd backend/blockchain-service
npm start
```

**Tab 3 — Frontend:**
```bash
cd frontend
npm run dev
```

Open http://localhost:3000, connect MetaMask to Arbitrum Sepolia.

---

## Simulating CRE Workflows Locally

CRE workflows can be simulated locally using the CRE CLI without a deployed DON. The backend and blockchain service must be running first.

```bash
cd cre-workflow
source .env
```

**Score a proposal via HTTP trigger:**
```bash
# The backend auto-writes this payload when a proposal is created
npm run simulate:score
```

**Score via EVM log trigger:**
```bash
# The backend auto-writes last-tx-hash.txt when a proposal is created
npm run simulate:evm
```

**Auto-close expired proposals:**
```bash
npm run simulate:autoclose
```

**Verify a World ID vote:**
```bash
# Edit cre-workflow/test/verify-vote-payload.json with a real IDKit proof result first
npm run simulate:verify-vote
```

**Auto-written payload files:**
```
cre-workflow/test/
├── score-proposal-payload.json    ← { proposalId, parkId } — auto-written on proposal creation
├── last-tx-hash.txt               ← createProposal tx hash — auto-written on proposal creation
└── verify-vote-payload.json       ← World ID proof — update manually for testing
```

---

## Project Structure

```
UrbanLeaf/
├── README.md
├── Makefile                              # make install / make run-all
│
├── backend/                              # FastAPI server (port 4000)
│   ├── main.py                           # App entry point, all routes
│   ├── agent.py                          # AI agent — Gemini intent classification
│   ├── blockchain.py                     # Blockchain service HTTP client
│   ├── database.py                       # Supabase + park data queries
│   ├── utils.py                          # NDVI, PM2.5, population compute
│   ├── email_service.py                  # SendGrid proposal notifications
│   └── blockchain-service/              # Node.js/Express server (port 5000)
│       ├── src/
│       │   ├── routes/contract-routes.js # All /api/contract/* endpoints
│       │   └── services/
│       │       └── blockchain-service.js # ethers.js contract wrapper
│       ├── contracts/
│       │   └── UrbanLeafCommunity.sol    # Main contract (USDC + World ID + CRE)
│       ├── scripts/deploy-contract.js    # Deployment script
│       └── artifacts/                   # Compiled ABI + bytecode (after compile)
│
├── cre-workflow/                         # Chainlink CRE workflows
│   ├── project.yaml                      # RPC config for Arbitrum Sepolia
│   ├── secrets.yaml                      # GEMINI_API_KEY secret definition
│   ├── .env                              # CRE_TARGET, CRE_ETH_PRIVATE_KEY
│   ├── package.json                      # simulate:* npm scripts
│   ├── test/
│   │   ├── score-proposal-payload.json   # HTTP trigger test payload
│   │   ├── last-tx-hash.txt              # EVM trigger test tx hash
│   │   └── verify-vote-payload.json      # World ID test payload
│   ├── score-proposal/                   # HTTP → Gemini score → on-chain
│   ├── evm-score-proposal/               # EVM log → Gemini score → on-chain
│   ├── auto-close/                       # Cron → finalize expired proposals
│   └── verify-vote/                      # HTTP → World ID v4 verify → vote
│
└── frontend/                             # Next.js 15 app (port 3000)
    ├── app/
    │   ├── page.tsx                       # Home — Mapbox map, AI chat, park search
    │   ├── proposal/page.tsx              # Proposals — vote, World ID, donate USDC
    │   ├── dashboard/page.tsx             # Gov dashboard — manage proposals
    │   ├── create-proposal/page.tsx       # Manual proposal creation
    │   ├── chat/page.tsx                  # Full AI chat interface
    │   └── profile/page.tsx              # User profile + gov employee status
    ├── lib/
    │   ├── wallet.ts                      # MetaMask — vote + USDC approve/donate
    │   └── api.ts                         # Backend API client
    └── components/providers/
        └── WalletProvider.tsx             # Wallet context (MetaMask state)
```

---

## Hackathon Tracks

- **Chainlink CRE** — 4 workflows across 3 trigger types (HTTP, EVM log, Cron) with full DON consensus on every workflow
- **Best use of World ID with CRE** — Off-chain World ID v4 verification via CRE DON as trust layer, enabling sybil-resistant governance on Arbitrum Sepolia without native World ID support
- **Circle / USDC** — ERC-20 USDC fundraising with approve/transferFrom pattern; stable-value community park funding on Arbitrum Sepolia
