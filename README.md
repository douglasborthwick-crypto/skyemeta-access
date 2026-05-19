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

That's it. Adopters bring their own InsumerAPI key (free at [insumermodel.com](https://insumermodel.com)) and their own NFT/SBT collection (mint via [RNWY](https://basescan.org/address/0x7ee64394904968629F93039585c3Fc8562691F31), Thirdweb, Crossmint, or your own contract).

## Pricing

The SDK is free and MIT-licensed. Every wallet-signed request triggers one verification call to InsumerAPI, which meters against your own InsumerAPI key. API-key requests never touch InsumerAPI.

## Distributed by

[Skye Meta Corp.](https://skyemeta.com) — wrapper layer over [InsumerAPI](https://insumermodel.com) (the wallet-auth primitive: condition-based access, ECDSA-signed booleans, JWKS-verifiable, 37 chains).

## License

MIT
