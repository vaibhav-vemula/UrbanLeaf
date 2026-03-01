# UrbanLeaf AI

> Community-driven urban park preservation powered by AI, on-chain governance, and Chainlink CRE.

UrbanLeaf AI lets communities vote on proposals to protect public parks. An AI agent analyzes real satellite NDVI and air quality data to generate environmental impact reports. Proposals, votes, and donations are recorded on-chain via Arbitrum Sepolia. The **Chainlink Runtime Environment (CRE)** is the verifiable orchestration layer — it watches the chain autonomously, scores every proposal with Gemini AI, and closes expired proposals on-chain with no human operator needed.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            User Browser                                  │
│                     Next.js 15 (port 3000)                               │
│  Mapbox map · AI chat · Proposal cards with CRE urgency scores           │
└──────────────────────────────┬──────────────────────────────────────────┘
                                │ REST
┌──────────────────────────────▼──────────────────────────────────────────┐
│                      FastAPI Backend (port 4000)                          │
│   Gemini AI agent · Google Earth Engine · Supabase                       │
│                                                                           │
│   POST /api/agent                     ← AI chat (intent routing)         │
│   GET  /api/park-environmental-data/{id}  ← consumed by CRE workflows    │
└──────────────┬────────────────────────────────────────┬──────────────────┘
               │ REST                                   │ HTTP trigger
┌──────────────▼──────────────┐          ┌──────────────▼──────────────────┐
│    Blockchain Service        │          │    Chainlink CRE Workflows       │
│    Express (port 5000)       │          │    cre-workflow/                 │
│    ethers.js v6              │          │                                  │
└──────────────┬───────────────┘          │  1. evm-score-proposal           │
               │                          │     EVM Log trigger              │
               │ ethers.js                │     Fires on ProposalCreated ◄───┼──┐
               │                          │     → fetch NDVI + PM2.5         │  │
               │                          │     → Gemini AI score            │  │
               │                          │     → setEnvironmentalScore()    │  │
               │                          │                                  │  │
               │                          │  2. score-proposal               │  │
               │                          │     HTTP trigger (fallback)      │  │
               │                          │     Same pipeline as above       │  │
               │                          │                                  │  │
               │                          │  3. auto-close                   │  │
               │                          │     Cron trigger (daily 00:00)   │  │
               │                          │     → read expired proposals     │  │
               │                          │     → Gemini closing summary     │  │
               │                          │     → updateProposalStatus()     │  │
               │                          └──────────────┬───────────────────┘  │
               │                                         │ on-chain writes       │
               │ createProposal / vote / donate          │                       │
┌──────────────▼─────────────────────────────────────────▼───────────────────┐  │
│  UrbanLeafCommunity.sol — Arbitrum Sepolia (chainId 421614)                 │  │
│                                                                              │  │
│  Proposal {                                                                  │  │
│    id, parkName, parkId, description, endDate, status                       │  │
│    yesVotes, noVotes, environmentalData, demographics                       │  │
│    fundingGoal, totalFundsRaised, fundingEnabled                            │  │
│    aiEnvironmentalScore  ← written by CRE                                   │──┘
│    aiUrgencyLevel        ← written by CRE                                   │
│    aiInsight             ← written by CRE                                   │
│    aiScored              ← written by CRE                                   │
│  }                                                                           │
│                                                                              │
│  Events: ProposalCreated ──► triggers evm-score-proposal CRE workflow       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### File Structure

```
UrbanLeaf/
├── frontend/                    # Next.js 15 web app (port 3000)
│   └── app/proposal/page.tsx    # Proposal cards with CRE AI urgency badges
├── backend/
│   ├── main.py                  # FastAPI — AI agent + proposals API (port 4000)
│   ├── agent.py                 # Gemini intent classification + proposal flow
│   ├── blockchain.py            # Python → blockchain-service + CRE trigger
│   ├── database.py              # Supabase queries + environmental analysis
│   └── blockchain-service/      # Node.js contract service (port 5000)
│       ├── contracts/
│       │   └── UrbanLeafCommunity.sol
│       ├── scripts/             # deploy-contract.js
│       └── src/                 # Express API + ethers.js
└── cre-workflow/                # Chainlink Runtime Environment
    ├── evm-score-proposal/      # Workflow 1: EVM Log trigger (autonomous)
    │   ├── workflow.yaml
    │   └── src/workflow.ts
    ├── score-proposal/          # Workflow 2: HTTP trigger (backend-initiated)
    │   ├── workflow.yaml
    │   └── src/workflow.ts
    ├── auto-close/              # Workflow 3: Cron trigger (daily midnight)
    │   ├── workflow.yaml
    │   └── src/workflow.ts
    ├── test/
    │   ├── score-proposal-payload.json  # auto-updated on proposal creation
    │   └── last-tx-hash.txt             # auto-updated on proposal creation
    └── .env.example
```

### Service Map

| Service | Stack | Port |
|---------|-------|------|
| Web App | Next.js 15, TypeScript | 3000 |
| AI API | FastAPI, Python | 4000 |
| Blockchain Service | Express, ethers.js v6 | 5000 |
| Smart Contract | Solidity 0.8.20, Arbitrum Sepolia | — |
| CRE Workflows | Chainlink CRE, TypeScript SDK | — |

---

## Chainlink CRE Integration

CRE is the verifiable orchestration layer for all AI-driven governance in UrbanLeaf. Three workflows, three trigger types.

### Workflow 1 — `evm-score-proposal` (EVM Log Trigger)

**The fully autonomous path.** The CRE DON watches `UrbanLeafCommunity.sol` on Arbitrum Sepolia. The moment `ProposalCreated` is emitted, CRE fires — no backend call needed.

```
ProposalCreated event emitted on-chain
  ↓  [CRE EVM Log Trigger]
  Decode proposalId + parkId from event args
  → GET /api/park-environmental-data/{parkId}  (live NDVI + PM2.5)
  → Gemini 2.0 Flash → urgency score (0-100) + level + insight
  → setEnvironmentalScore() on Arbitrum Sepolia
```

### Workflow 2 — `score-proposal` (HTTP Trigger)

**Backend-initiated fallback.** The UrbanLeaf backend calls this immediately after creating a proposal on-chain, ensuring the score is written even if the EVM trigger hasn't fired yet. Uses the same shared scoring pipeline.

```
User: "create proposal" → agent flow → proposal on-chain
  → backend POST /score-proposal to CRE
  → same pipeline as above
```

### Workflow 3 — `auto-close` (Cron Trigger — daily 00:00 UTC)

**Autonomous governance lifecycle.** No human operator needed to close proposals.

```
Cron fires 00:00 UTC daily
  → getAllActiveProposals() from Arbitrum Sepolia
  → filter proposals past their endDate
  → Gemini AI generates closing summary for each
  → updateProposalStatus() on-chain (Accepted / Declined by vote tally)
```

### Simulate all three workflows

```bash
# Install CRE CLI
brew install smartcontractkit/tap/cre-cli

cd cre-workflow
cp .env.example .env   # fill in keys
npm run install:all    # installs deps in all three workflow folders

# Workflow 1 — EVM Log trigger
# Needs a real ProposalCreated tx hash from Arbiscan
cre workflow simulate ./evm-score-proposal \
  --non-interactive --trigger-index 0 \
  --evm-tx-hash 0xYourProposalCreatedTxHash

# Workflow 2 — HTTP trigger
npm run simulate:score
# or:
cre workflow simulate ./score-proposal \
  --non-interactive --trigger-index 0 \
  --http-payload @./test/score-proposal-payload.json

# Workflow 3 — Cron trigger
npm run simulate:autoclose
# or:
cre workflow simulate ./auto-close \
  --non-interactive --trigger-index 0
```

---

## Tech Stack

**Frontend** — Next.js 15 (App Router), TypeScript, Tailwind CSS, Mapbox GL JS, ethers.js v6, Supabase JS

**Backend** — FastAPI (Python), Gemini 2.0 Flash, Google Earth Engine (NDVI satellite data)

**Blockchain** — Arbitrum Sepolia, Solidity 0.8.20, Hardhat, ethers.js v6

**CRE** — Chainlink Runtime Environment, TypeScript SDK — EVM Log + HTTP + Cron trigger workflows

**Infrastructure** — Supabase (PostgreSQL)

---

## Before You Start

| Service | What you need | Link |
|---------|---------------|------|
| **Gemini AI** | API key | [aistudio.google.com](https://aistudio.google.com) |
| **Google Earth Engine** | Project ID (free for research) | [earthengine.google.com](https://earthengine.google.com) |
| **Mapbox** | Public access token | [mapbox.com](https://account.mapbox.com) |
| **Supabase** | Project URL + anon key | [supabase.com](https://supabase.com) |
| **Arbitrum Sepolia** | Wallet private key + testnet ETH | See below |
| **Chainlink CRE CLI** | Installed locally | [docs.chain.link/cre](https://docs.chain.link/cre) |

### Getting Arbitrum Sepolia ETH

1. Install [MetaMask](https://metamask.io) and create a wallet
2. Export your private key: **Settings → Security → Export Private Key**
3. Get free testnet ETH:
   - [Alchemy Faucet](https://www.alchemy.com/faucets/arbitrum-sepolia)
   - [QuickNode Faucet](https://faucet.quicknode.com/arbitrum/sepolia)

> **Never use a wallet with real funds for deployment.**

---

## Setup

### 1. Install dependencies

```bash
# Frontend
cd frontend && npm install

# Blockchain service
cd backend/blockchain-service && npm install

# CRE workflows
cd cre-workflow && npm install

# Python backend
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Or install everything at once:

```bash
make install
```

### 2. Configure environment variables

**Backend** (`backend/.env`):

```bash
cp backend/.env.example backend/.env
```

```env
GEMINI_API_KEY=your-gemini-api-key
GEE_PROJECT_ID=your-google-earth-engine-project-id
BLOCKCHAIN_SERVICE_URL=http://localhost:5000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key
PORT=4000

# CRE — leave CRE_WORKFLOW_URL blank locally
# Set CRE_WORKFLOW_DIR so simulate payloads are auto-updated on proposal creation
CRE_WORKFLOW_URL=
CRE_WORKFLOW_DIR=/path/to/UrbanLeaf/cre-workflow
```

**Blockchain service** (`backend/blockchain-service/.env`):

```bash
cp backend/blockchain-service/.env.example backend/blockchain-service/.env
```

```env
PORT=5000
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
PRIVATE_KEY=your-wallet-private-key-without-0x-prefix
CONTRACT_ADDRESS=                    # fill after deploying
```

**CRE workflows** (`cre-workflow/.env`):

```bash
cp cre-workflow/.env.example cre-workflow/.env
```

```env
URBANLEAF_API_URL=http://localhost:4000
GEMINI_API_KEY=your-gemini-api-key
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
CONTRACT_ADDRESS=                    # fill after deploying
PRIVATE_KEY=your-wallet-private-key-without-0x-prefix
```

**Frontend** (`frontend/.env.local`):

```bash
cp frontend/.env.local.example frontend/.env.local
```

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_BLOCKCHAIN_SERVICE_URL=http://localhost:5000
NEXT_PUBLIC_CONTRACT_ADDRESS=        # fill after deploying
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-public-token
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

---

## Deploy the Smart Contract

### Step 1 — Compile

```bash
make compile
# or: cd backend/blockchain-service && npm run compile
```

### Step 2 — Deploy to Arbitrum Sepolia

```bash
make deploy
# or: cd backend/blockchain-service && npm run deploy
```

Successful output:

```
Network: Arbitrum Sepolia (chainId: 421614)
Deployer: 0xYourWalletAddress

Contract deployed successfully!
Contract Address: 0xABC123...
Transaction Hash: 0xDEF456...
Explorer: https://sepolia.arbiscan.io/address/0xABC123...
```

### Step 3 — Update all env files

```bash
# backend/blockchain-service/.env
CONTRACT_ADDRESS=0xABC123...

# backend/.env
CONTRACT_ADDRESS=0xABC123...

# cre-workflow/.env
CONTRACT_ADDRESS=0xABC123...

# frontend/.env.local
NEXT_PUBLIC_CONTRACT_ADDRESS=0xABC123...
```

---

## Running Locally

```bash
# Terminal 1 — FastAPI backend (port 4000)
make backend

# Terminal 2 — Blockchain service (port 5000)
make blockchain

# Terminal 3 — Next.js frontend (port 3000)
make frontend
```

Open [http://localhost:3000](http://localhost:3000).

After creating a proposal via the frontend, the backend automatically updates
`cre-workflow/test/score-proposal-payload.json` and `cre-workflow/test/last-tx-hash.txt`
with the real `proposalId`, `parkId`, and tx hash. Then run:

```bash
cd cre-workflow

# Score the proposal (HTTP trigger)
npm run simulate:score

# Score via EVM Log trigger (uses auto-saved tx hash)
npm run simulate:evm

# Close expired proposals (Cron trigger)
npm run simulate:autoclose
```

---

## End-to-End User Flow

1. **Connect** MetaMask — app auto-switches to Arbitrum Sepolia
2. **Explore** parks on the interactive Mapbox map
3. **Chat** with the AI agent — ask about NDVI, air quality, population impact
4. **Create proposal** (authorized users only):
   - Agent collects environmental analysis + fundraising settings
   - Proposal written to Arbitrum Sepolia → `ProposalCreated` event emitted
   - Backend auto-updates CRE simulate payloads with the new `proposalId` + tx hash
   - **Locally:** run `npm run simulate:score` or `npm run simulate:evm` to trigger scoring
   - **Production:** CRE `evm-score-proposal` fires autonomously — decodes event, fetches live env data, calls Gemini AI, writes urgency score (0–100) back on-chain
5. **Vote** on proposals — AI urgency badge (Critical / High / Medium / Low) visible on every card
6. **Proposals auto-close** — CRE `auto-close` cron runs daily at midnight, tallies votes, calls `updateProposalStatus()` on-chain
7. **Donate ETH** to accepted proposals to fund preservation

---

## Smart Contract Reference

**`UrbanLeafCommunity.sol`** — Arbitrum Sepolia

| Function | Access | Description |
|----------|--------|-------------|
| `createProposal()` | public | Create a park protection proposal; emits `ProposalCreated` |
| `vote()` | public | Cast a yes/no vote |
| `donateToProposal()` | public payable | Donate ETH to an accepted proposal |
| `updateProposalStatus()` | owner | Tally votes and finalise status — called by CRE `auto-close` |
| `setEnvironmentalScore()` | owner | Write AI urgency score — called by CRE scoring workflows |
| `getEnvironmentalScore()` | view | Read AI score, urgency level, and insight for a proposal |
| `setFundingGoal()` | owner | Set ETH fundraising target |
| `withdrawFunds()` | owner | Withdraw raised funds |
| `hasUserVoted()` | view | Check if address has voted |
| `getDonationProgress()` | view | Get raised / goal / percentage |

**CRE-related events:**

| Event | Emitted by | Consumed by |
|-------|-----------|-------------|
| `ProposalCreated` | `createProposal()` | CRE `evm-score-proposal` (EVM Log trigger) |
| `EnvironmentalScoreSet` | `setEnvironmentalScore()` | Frontend — updates urgency badge |

---

## All Commands

```bash
make install    # install all dependencies
make backend    # start FastAPI on :4000
make blockchain # start blockchain service on :5000
make frontend   # start Next.js on :3000
make compile    # compile smart contracts with Hardhat
make deploy     # deploy contract to Arbitrum Sepolia
make clean      # remove .next, __pycache__, artifacts, cache
make help       # list all commands
```

---

## Explorer

All transactions are publicly visible on [Arbitrum Sepolia Arbiscan](https://sepolia.arbiscan.io).
