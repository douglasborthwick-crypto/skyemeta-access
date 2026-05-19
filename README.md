# @skyemeta/access

Add wallet-token authentication to your API without disturbing existing API-key customers.

```bash
npm install @skyemeta/access
```

## What it does

You run an API. Today your customers authenticate with an API key. But AI agents already have wallets — they'd rather authenticate the same way they do everything else: by signing with their wallet.

`@skyemeta/access` is an either-or middleware:

- **`X-API-Key` header present** → your existing handler runs, untouched. Zero overhead.
- **`Authorization: Wallet ...` header present** → SDK verifies the SIWE signature, then asks InsumerAPI's `/v1/attest` whether the wallet still holds a valid token from the configured collection. Yes → request passes. No → 401.
- **Neither** → 401.

Your humans keep their keys. Your agents use the wallet they were going to carry anyway. Both work on the same routes.

## Quick start

```ts
import express from 'express';
import { Access } from '@skyemeta/access';

const access = new Access({
  insumerApiKey: process.env.INSUMER_API_KEY!,
  siweDomain: 'api.yourservice.com',
  collections: {
    default: { address: process.env.ACCESS_COLLECTION!, chain: 'base' },
  },
});

const app = express();

app.post(
  '/api/v1/whatever',
  access.requireValidPassOrApiKey(yourApiKeyMiddleware),
  handler,
);
```

`siweDomain` is required and must match what your wallet clients put in their SIWE message domain field. Set it explicitly to the host your API serves SIWE messages for — don't rely on request-host inference behind reverse proxies.

Adopters also bring their own NFT/SBT collection (mint via [RNWY](https://basescan.org/address/0x7ee64394904968629F93039585c3Fc8562691F31), Thirdweb, Crossmint, or your own contract). See [Get an InsumerAPI key](#get-an-insumerapi-key) below for the key acquisition step.

## Get an InsumerAPI key

The SDK calls `/v1/attest` on your behalf, so you need an InsumerAPI key in `INSUMER_API_KEY`.

**Wallet-native (recommended for agent infrastructure):**

Send USDC or USDT to the InsumerAPI platform wallet on any supported chain, then POST the transaction hash. The sender wallet becomes the key's identity — no email, no signup form, no static credential to issue.

```bash
curl -X POST https://api.insumermodel.com/v1/keys/buy \
  -H "Content-Type: application/json" \
  -d '{"txHash":"0x…","chainId":8453,"amount":5,"appName":"my-agent"}'
```

Response (key shown only once — store it):

```json
{
  "ok": true,
  "data": {
    "success": true,
    "key": "insr_live_...",
    "registeredWallet": "0x...",
    "totalCredits": 125
  }
}
```

Solana (USDC/USDT), Bitcoin (native BTC), and Tron (USDT-TRC20) are also supported via the same endpoint — see [`/v1/keys/buy` in the OpenAPI spec](https://insumermodel.com/openapi.yaml) for the platform wallet addresses per chain and the full request schema. Minimum purchase is $5 (or BTC equivalent). Volume discounts: $5–$99 = 25 credits/$1; $100–$499 = 33 credits/$1 (25% off); $500+ = 50 credits/$1 (50% off).

**Human signup (free tier):**

If you're a human developer and want to try before paying, the signup form at [insumermodel.com](https://insumermodel.com) issues a free key (10 attestation credits, 100 requests/day, no card) in about 10 seconds.

## What's in scope (v0.1.x)

The SDK's `requireValidPassOrApiKey` and `requireValidPass` middleware check **NFT ownership on EVM chains** (`nft_ownership` condition against any of the 31 EVM chains InsumerAPI supports — Ethereum, Base, Optimism, Arbitrum, Polygon, etc.). Non-EVM chains (Solana, XRPL, Bitcoin, Tron, Stellar, Sui) and richer condition types (`token_balance`, `eas_attestation`, `farcaster_id`, compound stacks) are reachable via direct calls to InsumerAPI's `/v1/attest` — the SDK's middleware stays focused on the common case.

## Pricing

The SDK is free and MIT-licensed. Each wallet-signed request hits InsumerAPI's `/v1/attest` once per `cacheTtlMs` window per (wallet, collection); cached results inside that window skip the upstream call. With the default `cacheTtlMs: 2000`, a wallet sending five requests in a second triggers one attest call. Adopters running high-throughput or revocation-sensitive flows can shrink the cache or set `cacheTtlMs: 0` to disable it. API-key requests never touch InsumerAPI.

When `/v1/attest` is unreachable, the SDK falls back to its most recent cached result if available and no more than 60 seconds past expiry (`MAX_STALE_FALLBACK_MS`). Beyond that window it fails closed with a 503. Adopters who need stricter revocation propagation can set `cacheTtlMs: 0` to opt out of cache + grace entirely.

## Distributed by

[Skye Meta Corp.](https://skyemeta.com) — wrapper layer over [InsumerAPI](https://insumermodel.com) (the wallet-auth primitive: condition-based access, ECDSA-signed booleans, JWKS-verifiable, 37 chains).

## License

MIT
