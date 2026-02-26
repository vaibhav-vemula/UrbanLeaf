# UrbanLeaf AI — Frontend

Next.js 15 web application for community-driven park protection.

## Structure

```
frontend/
├── app/                       # Next.js App Router pages
│   ├── layout.tsx
│   ├── page.tsx               # Landing / wallet connect
│   ├── options/               # Feature selection hub
│   ├── chat/                  # AI planner + interactive map
│   ├── proposal/              # Browse & vote on proposals
│   ├── create-proposal/       # Create proposal (authorized users)
│   ├── dashboard/             # User stats
│   └── profile/               # Wallet & user profile
├── components/
│   ├── chat/                  # ChatInput, ChatMessage
│   ├── map/                   # MapView (Mapbox)
│   ├── providers/             # WalletProvider (MetaMask context)
│   └── ui/                    # CustomCursor, ProtectedRoute,
│                              #   WalletConnectButton, WalletStatus,
│                              #   UserRegistrationModal
├── lib/
│   ├── wallet.ts              # MetaMask connect, vote, donate (ethers.js)
│   ├── api.ts                 # FastAPI client
│   ├── supabase.ts            # User profile queries
│   └── geocoding.ts           # Address → coordinates
└── types/
    └── index.ts               # Shared TypeScript types
```

## Setup

```bash
npm install
```

Copy `.env.local.example` to `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_BLOCKCHAIN_SERVICE_URL=http://localhost:5000
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_MAPBOX_TOKEN=...
```

## Running

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint     # ESLint
```

## Wallet

MetaMask only. The app auto-switches to **Arbitrum Sepolia** (chainId: 421614) on connect.

Voting and donations are signed directly by the user's wallet via ethers.js — no server-side private key required for user actions.

## Key Libraries

| Library | Purpose |
|---------|---------|
| Next.js 15 | App framework (App Router) |
| ethers.js v6 | Wallet connection, contract calls |
| Mapbox GL JS | Interactive park maps |
| Supabase JS | User profile read/write |
| Tailwind CSS | Styling |
| Lucide React | Icons |
