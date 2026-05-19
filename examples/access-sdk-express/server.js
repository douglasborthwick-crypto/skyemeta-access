import express from 'express';
import { privateKeyToAccount } from 'viem/accounts';
import { Access } from '@skyemeta/access';

const DEFAULT_VALID_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

export function buildServer(opts = {}) {
  const validWallets = new Set(
    (opts.validWallets ?? [privateKeyToAccount(DEFAULT_VALID_PRIVATE_KEY).address])
      .map((w) => w.toLowerCase()),
  );

  const access = new Access({
    insumerApiKey: 'dev-key-not-used-in-mock-mode',
    collections: {
      default: { address: '0x3E2a408cc6eceba04FF9d04A5B8B05aBa8DD50ce', chain: 'base' },
    },
    siweDomain: opts.siweDomain ?? 'localhost',
    cacheTtlMs: 0,
    localMode: {
      mockAttest: async (wallet) => validWallets.has(wallet.toLowerCase()),
    },
    disabled: opts.disabled === true,
  });

  const apiKeyMiddleware = (req, res, next) => {
    if (req.headers['x-api-key'] === 'test-key-abc') {
      req.apiKeyCustomer = 'test-customer';
      return next();
    }
    res.status(401).json({ ok: false, error: { code: 401, message: 'Invalid API key' } });
  };

  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.post('/api/v1/whatever', access.requireValidPassOrApiKey(apiKeyMiddleware), (req, res) => {
    res.json({
      ok: true,
      authenticatedAs: req.skyemetaAccess?.wallet ?? req.apiKeyCustomer ?? 'unknown',
      via: req.skyemetaAccess ? 'wallet' : 'apiKey',
    });
  });

  app.post('/api/v1/agent-only', access.requireValidPass(), (req, res) => {
    res.json({
      ok: true,
      authenticatedAs: req.skyemetaAccess.wallet,
      via: 'wallet',
    });
  });

  return { app, access, validWallets };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app, validWallets } = buildServer();
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`access-sdk-express example listening on http://localhost:${port}`);
    console.log(`mock-attest will pass for: ${[...validWallets].join(', ')}`);
  });
}
