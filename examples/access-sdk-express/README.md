# access-sdk-express

Canonical Express adopter reference for `@skyemeta/access`.

## Run the server

```bash
npm install
npm start
# → http://localhost:3000
```

Routes:
- `POST /api/v1/whatever` — either-or (X-API-Key or wallet)
- `POST /api/v1/agent-only` — wallet only
- `GET  /health`

Test API key: `X-API-Key: test-key-abc`
Valid wallet (mock): `0xa0Ee7A142d267C1f36714E4a8F75612F20a79720`

## Run the smoke test

```bash
npm test
```

Boots an in-process Express instance and exercises every code path in the SDK (header routing, replay, expiry, future skew, domain mismatch, disabled mode, construction-time guards). Uses `localMode.mockAttest` — no network calls to InsumerAPI.
