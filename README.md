# UrbanLeaf AI

> Community-driven urban park preservation powered by AI, on-chain governance, and environmental data.

UrbanLeaf AI lets communities vote on proposals to protect public parks. An AI agent analyzes real satellite NDVI and air quality data to generate environmental impact reports. Proposals, votes, and donations are recorded on-chain via Arbitrum Sepolia, with World ID verification bridged through Chainlink CRE.

---

## Architecture

```
UrbanLeaf/
├── frontend/                  # Next.js 15 web app (port 3000)
└── backend/
    ├── main.py                # FastAPI AI + proposals API (port 4000)
    ├── agent.py               # Gemini AI agent
    ├── blockchain.py          # Python → blockchain-service bridge
    ├── database.py            # Supabase queries
    ├── models.py              # Pydantic models
    └── blockchain-service/    # Node.js contract service (port 5000)
        ├── contracts/         # UrbanLeafCommunity.sol
        ├── scripts/           # deploy-contract.js
        └── src/               # Express API + ethers.js
```

### Service Map

| Service            | Stack                   | Port |
|--------------------|-------------------------|------|
| Web App            | Next.js 15, TypeScript  | 3000 |
| AI API             | FastAPI, Python         | 4000 |
| Blockchain Service | Express, ethers.js v6   | 5000 |
| Smart Contract     | Solidity 0.8.20         | —    |

---

## Tech Stack

**Frontend** — Next.js 15 (App Router), TypeScript, Tailwind CSS, Mapbox GL JS, ethers.js v6, Supabase JS

**Backend** — FastAPI (Python), Gemini AI, Google Earth Engine (NDVI satellite data)

**Blockchain** — Arbitrum Sepolia, Solidity 0.8.20, Hardhat, ethers.js v6, Chainlink CRE (planned)

**Infrastructure** — Supabase (PostgreSQL)

---

## Before You Start

You will need accounts and credentials for the following:

| Service | What you need | Link |
|---------|---------------|------|
| **Gemini AI** | API key | [aistudio.google.com](https://aistudio.google.com) |
| **Google Earth Engine** | Project ID (free for research) | [earthengine.google.com](https://earthengine.google.com) |
| **Mapbox** | Public access token | [mapbox.com](https://account.mapbox.com) |
| **Supabase** | Project URL + anon key | [supabase.com](https://supabase.com) |
| **Arbitrum Sepolia** | Wallet private key + testnet ETH | See below |

### Getting Arbitrum Sepolia ETH

1. Install [MetaMask](https://metamask.io) and create a wallet
2. Export your private key from MetaMask: **Settings → Security → Export Private Key**
3. Get free testnet ETH from any faucet:
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

# Python backend (use a virtual environment)
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
```

**Blockchain service** (`backend/blockchain-service/.env`):

```bash
cp backend/blockchain-service/.env.example backend/blockchain-service/.env
```

```env
PORT=5000
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
PRIVATE_KEY=your-wallet-private-key-without-0x-prefix
CONTRACT_ADDRESS=                                        # fill after deploying
```

**Frontend** (`frontend/.env.local`):

```bash
cp frontend/.env.local.example frontend/.env.local
```

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_BLOCKCHAIN_SERVICE_URL=http://localhost:5000
NEXT_PUBLIC_CONTRACT_ADDRESS=                            # fill after deploying
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-public-token
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

---

## Deploy the Smart Contract

This only needs to be done once (or when the contract changes).

### Step 1 — Compile

```bash
make compile
# or: cd backend/blockchain-service && npm run compile
```

Output: `backend/blockchain-service/artifacts/contracts/UrbanLeafCommunity.sol/UrbanLeafCommunity.json`

### Step 2 — Deploy to Arbitrum Sepolia

```bash
make deploy
# or: cd backend/blockchain-service && npm run deploy
```

Successful output looks like:

```
Network: Arbitrum Sepolia (chainId: 421614)
Deployer: 0xYourWalletAddress
Balance: 0.05 ETH

Deploying contract...

Contract deployed successfully!
Contract Address: 0xABC123...
Transaction Hash: 0xDEF456...
Explorer: https://sepolia.arbiscan.io/address/0xABC123...

Deployment info saved to deployments-arbitrum.json
```

### Step 3 — Update env files with the contract address

Copy the `Contract Address` from the output and paste it into:

```bash
# backend/blockchain-service/.env
CONTRACT_ADDRESS=0xABC123...

# backend/.env  (if referenced)
CONTRACT_ADDRESS=0xABC123...

# frontend/.env.local
NEXT_PUBLIC_CONTRACT_ADDRESS=0xABC123...
```

The deployment record is also saved automatically to `backend/blockchain-service/deployments-arbitrum.json`.

---

## Running Locally

Start each service in a separate terminal:

```bash
# Terminal 1 — FastAPI backend (port 4000)
make backend
# or: cd backend && uvicorn main:app --reload --port 4000

# Terminal 2 — Blockchain service (port 5000)
make blockchain
# or: cd backend/blockchain-service && npm run dev

# Terminal 3 — Next.js frontend (port 3000)
make frontend
# or: cd frontend && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> The blockchain service must be running before the FastAPI backend can process proposals.

---

## User Flow

1. **Connect** MetaMask — app auto-switches to Arbitrum Sepolia
2. **Explore** parks on the interactive Mapbox map
3. **Chat** with the AI agent — ask about NDVI, air quality, population impact
4. **Vote** on active proposals — transaction signed on-chain via MetaMask
5. **Donate ETH** to accepted proposals to fund preservation
6. **Create proposals** — authorized government employees only (set via profile)

---

## Smart Contract Reference

**`UrbanLeafCommunity.sol`** on Arbitrum Sepolia

| Function | Access | Description |
|----------|--------|-------------|
| `createProposal()` | public | Create a park protection proposal |
| `vote()` | public | Cast a yes/no vote |
| `donateToProposal()` | public payable | Donate ETH to an accepted proposal |
| `updateProposalStatus()` | owner | Tally votes and close proposal |
| `setFundingGoal()` | owner | Set ETH fundraising target |
| `withdrawFunds()` | owner | Withdraw raised funds |
| `hasUserVoted()` | view | Check if address has voted |
| `getDonationProgress()` | view | Get raised / goal / percentage |

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
