# UrbanLeaf AI — Backend

Python FastAPI server (AI agent + park data API) and Node.js blockchain microservice.

## Structure

```
backend/
├── main.py                    # FastAPI entry point (port 4000)
├── agent.py                   # Gemini AI agent logic
├── blockchain.py              # HTTP client → blockchain-service
├── database.py                # Supabase queries
├── models.py                  # Pydantic request/response models
├── email_service.py           # Email notifications
├── utils.py                   # Shared utilities
├── close_proposals.py         # Cron job to close expired proposals
├── requirements.txt
└── blockchain-service/        # Node.js microservice (port 5000)
    ├── contracts/
    │   └── UrbanLeafCommunity.sol
    ├── scripts/
    │   └── deploy-contract.js
    ├── src/
    │   ├── index.js
    │   ├── routes/
    │   │   └── contract-routes.js
    │   └── services/
    │       └── blockchain-service.js
    ├── hardhat.config.cjs
    └── package.json
```

## Setup

```bash
# Python dependencies
pip install -r requirements.txt

# Blockchain service dependencies
cd blockchain-service && npm install
```

## Environment

Copy `.env.example` to `.env`:

```env
GEMINI_API_KEY=
GEE_PROJECT_ID=
BLOCKCHAIN_SERVICE_URL=http://localhost:5000
SUPABASE_URL=
SUPABASE_KEY=
PORT=4000
```

Copy `blockchain-service/.env.example` to `blockchain-service/.env`:

```env
PORT=5000
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
PRIVATE_KEY=your-deployer-private-key
CONTRACT_ADDRESS=
```

## Running

```bash
# FastAPI (from backend/)
uvicorn main:app --reload --port 4000

# Blockchain service (from backend/blockchain-service/)
npm run dev
```

## Smart Contract

```bash
# Compile
cd blockchain-service && npm run compile

# Deploy to Arbitrum Sepolia
npm run deploy
```

## API Endpoints

### FastAPI (port 4000)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agent` | Send message to AI agent |
| GET | `/api/proposals` | List all proposals |
| GET | `/api/proposals/:id` | Get proposal details |
| GET | `/api/parks/:zipcode` | Get parks by zipcode |
| GET | `/api/user-balances` | Get ETH balance for address |

### Blockchain Service (port 5000)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/contract/create-proposal` | Create proposal on-chain |
| POST | `/api/contract/vote` | Submit vote |
| GET | `/api/contract/proposal/:id` | Get proposal |
| GET | `/api/contract/proposals/active` | Active proposals |
| GET | `/api/contract/proposals/accepted` | Accepted proposals |
| GET | `/api/contract/proposals/rejected` | Rejected proposals |
| GET | `/api/contract/donation-progress/:id` | Funding progress |
| GET | `/api/contract/has-voted/:id/:address` | Check if voted |
| GET | `/health` | Service health check |
