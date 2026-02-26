# UrbanLeaf AI — Blockchain Service

Node.js/Express microservice that handles all smart contract interactions for UrbanLeaf AI on Arbitrum Sepolia.

---

## Structure

```
blockchain-service/
├── contracts/
│   └── UrbanLeafCommunity.sol     # Governance + donations contract
├── scripts/
│   └── deploy-contract.js         # Arbitrum Sepolia deployment
├── src/
│   ├── index.js                   # Express server entry point
│   ├── routes/
│   │   └── contract-routes.js     # REST API route handlers
│   └── services/
│       └── blockchain-service.js  # ethers.js contract wrapper
├── artifacts/                     # Compiled ABI + bytecode (generated)
├── hardhat.config.cjs             # Hardhat config (Arbitrum Sepolia)
├── package.json
└── .env
```

---

## Prerequisites

- Node.js 18+
- MetaMask or any EVM wallet with Arbitrum Sepolia ETH
- Arbitrum Sepolia testnet ETH ([faucet](https://www.alchemy.com/faucets/arbitrum-sepolia))

---

## Setup

```bash
npm install
```

Copy `.env.example` to `.env`:

```env
PORT=5000
ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
PRIVATE_KEY=your-deployer-private-key
CONTRACT_ADDRESS=0x...
```

> **Never commit your `.env` with a real private key.**

---

## Running

```bash
npm run dev     # development with auto-reload
npm start       # production
```

Service runs at `http://localhost:5000`.

---

## Smart Contract

### Compile

```bash
npm run compile
```

Hardhat settings:
- Solidity: `0.8.20`
- Optimizer: enabled, 1000 runs
- Output: `artifacts/contracts/UrbanLeafCommunity.sol/`

### Deploy to Arbitrum Sepolia

```bash
npm run deploy
```

This will:
1. Compile the contract
2. Deploy to Arbitrum Sepolia (chainId: 421614)
3. Save the address to `deployments-arbitrum.json`
4. Print the Arbiscan explorer link

After deployment, update `CONTRACT_ADDRESS` in:
- `backend/blockchain-service/.env`
- `backend/.env`
- `frontend/.env.local`

---

## API Endpoints

### Health

```
GET /health
```

### Contract Info

```
GET /api/contract/info
```

### Proposals

```
POST /api/contract/create-proposal
GET  /api/contract/proposal/:id
GET  /api/contract/proposals/active
GET  /api/contract/proposals/accepted
GET  /api/contract/proposals/rejected
```

### Voting

```
POST /api/contract/vote
GET  /api/contract/has-voted/:proposalId/:address
```

**Request body for `/vote`:**
```json
{
  "proposalId": 1,
  "vote": true,
  "voter": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8"
}
```

### Donations

```
GET /api/contract/donation-progress/:proposalId
```

### Balances

```
GET /api/balances/:address
```

---

## Contract: `UrbanLeafCommunity.sol`

| Function | Access | Description |
|----------|--------|-------------|
| `createProposal()` | public | Create a park protection proposal |
| `vote()` | public | Cast yes/no vote |
| `donateToProposal()` | public payable | Donate ETH to accepted proposal |
| `updateProposalStatus()` | owner | Close voting and tally result |
| `forceCloseProposal()` | owner | Manually close a proposal |
| `setFundingGoal()` | owner | Set ETH funding target |
| `withdrawFunds()` | owner | Withdraw raised funds |
| `hasUserVoted()` | view | Check if address has voted |
| `getDonationProgress()` | view | Get raised/goal/percentage |

---

## Deployment Workflow

1. Edit `contracts/UrbanLeafCommunity.sol`
2. `npm run compile` — compile with Hardhat
3. `npm run deploy` — deploy to Arbitrum Sepolia
4. Copy `CONTRACT_ADDRESS` from output into all `.env` files
5. View on [Arbiscan](https://sepolia.arbiscan.io)

---

## Troubleshooting

**Contract not found** — verify `CONTRACT_ADDRESS` in `.env` matches the deployed address.

**Compilation errors** — `viaIR: true` is set in `hardhat.config.cjs` to handle stack depth; ensure Solidity version is `0.8.20`.

**Deployment fails** — confirm the deployer wallet has Arbitrum Sepolia ETH and `PRIVATE_KEY` is a raw hex key (no `0x` prefix needed depending on your setup).

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `ethers` v6 | Contract interactions, provider, signer |
| `express` | HTTP server |
| `cors` | Cross-origin requests |
| `helmet` | Security headers |
| `morgan` | Request logging |
| `dotenv` | Environment variables |
| `hardhat` | Contract compilation |
| `nodemon` | Dev auto-reload |
