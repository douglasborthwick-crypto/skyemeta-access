import { buildServer } from './server.js';
import { newAgent, signSiweEnvelope, randomNonce, VALID_PRIVATE_KEY } from './agent.js';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ${PASS} ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ${FAIL} ${name}`);
    console.log(`    ${DIM}${err.message}${RESET}`);
    failures.push({ name, err });
    failed++;
  }
}

function expectStatus(res, expected, label = '') {
  if (res.status !== expected) {
    throw new Error(`${label} expected status ${expected}, got ${res.status}`);
  }
}

function expectBodyMatch(body, predicate, label) {
  if (!predicate(body)) {
    throw new Error(`${label}: body did not match — ${JSON.stringify(body)}`);
  }
}

async function post(baseUrl, path, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({}),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function startServer(opts = {}) {
  const { app } = buildServer(opts);
  return await new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      resolve({ baseUrl: `http://localhost:${port}`, server });
    });
  });
}

function stop(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function main() {
  console.log('\n@skyemeta/access — smoke test (mock-attest mode)\n');

  const validAgent = newAgent(VALID_PRIVATE_KEY);
  const invalidAgent = newAgent();

  console.log('Normal mode:');
  const normal = await startServer({ siweDomain: 'localhost', validWallets: [validAgent.address] });

  await check('GET /health returns ok', async () => {
    const res = await fetch(`${normal.baseUrl}/health`);
    expectStatus(res, 200);
  });

  await check('X-API-Key happy path → 200, routed via apiKey', async () => {
    const res = await post(normal.baseUrl, '/api/v1/whatever', { 'X-API-Key': 'test-key-abc' });
    expectStatus(res, 200, 'apiKey');
    expectBodyMatch(res.body, (b) => b.via === 'apiKey', 'expected via=apiKey');
  });

  await check('X-API-Key wrong key → 401 from adopter middleware', async () => {
    const res = await post(normal.baseUrl, '/api/v1/whatever', { 'X-API-Key': 'wrong' });
    expectStatus(res, 401);
  });

  await check('Wallet signature, valid pass → 200, routed via wallet', async () => {
    const { header } = await signSiweEnvelope(validAgent.account);
    const res = await post(normal.baseUrl, '/api/v1/whatever', { Authorization: header });
    expectStatus(res, 200, 'wallet-valid');
    expectBodyMatch(res.body, (b) => b.via === 'wallet' && b.authenticatedAs.toLowerCase() === validAgent.address.toLowerCase(), 'wallet routing');
  });

  await check('Wallet signature, no valid pass → 401 InvalidPass', async () => {
    const { header } = await signSiweEnvelope(invalidAgent.account);
    const res = await post(normal.baseUrl, '/api/v1/whatever', { Authorization: header });
    expectStatus(res, 401);
    expectBodyMatch(res.body, (b) => /valid access token/i.test(b.error?.message ?? ''), 'invalid-pass message');
  });

  await check('Both X-API-Key + Authorization → X-API-Key wins (with warning logged)', async () => {
    const { header } = await signSiweEnvelope(validAgent.account);
    const res = await post(normal.baseUrl, '/api/v1/whatever', {
      'X-API-Key': 'test-key-abc',
      Authorization: header,
    });
    expectStatus(res, 200, 'both-headers');
    expectBodyMatch(res.body, (b) => b.via === 'apiKey', 'expected via=apiKey under collision');
  });

  await check('Neither header → 401 MissingAuth', async () => {
    const res = await post(normal.baseUrl, '/api/v1/whatever');
    expectStatus(res, 401);
  });

  await check('Replay: same envelope twice → second is 401 ReplayedNonce', async () => {
    const { header } = await signSiweEnvelope(validAgent.account);
    const first = await post(normal.baseUrl, '/api/v1/whatever', { Authorization: header });
    expectStatus(first, 200, 'first');
    const second = await post(normal.baseUrl, '/api/v1/whatever', { Authorization: header });
    expectStatus(second, 401, 'replay');
    expectBodyMatch(second.body, (b) => /replay/i.test(b.error?.message ?? ''), 'replay message');
  });

  await check('Expired signature (>5 min old) → 401 ExpiredSignature', async () => {
    const oldIssuedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const { header } = await signSiweEnvelope(validAgent.account, { issuedAt: oldIssuedAt, nonce: randomNonce() });
    const res = await post(normal.baseUrl, '/api/v1/whatever', { Authorization: header });
    expectStatus(res, 401);
    expectBodyMatch(res.body, (b) => /expired/i.test(b.error?.message ?? ''), 'expired message');
  });

  await check('Future signature (>10s in future) → 401 FutureSignature', async () => {
    const futureIssuedAt = new Date(Date.now() + 30 * 1000).toISOString();
    const { header } = await signSiweEnvelope(validAgent.account, { issuedAt: futureIssuedAt, nonce: randomNonce() });
    const res = await post(normal.baseUrl, '/api/v1/whatever', { Authorization: header });
    expectStatus(res, 401);
    expectBodyMatch(res.body, (b) => /time mismatch/i.test(b.error?.message ?? ''), 'future message');
  });

  await check('Malformed Authorization: Wallet → 401', async () => {
    const res = await post(normal.baseUrl, '/api/v1/whatever', { Authorization: 'Wallet not-base64-json' });
    expectStatus(res, 401);
  });

  await check('Domain mismatch → 401 InvalidSignature', async () => {
    const { header } = await signSiweEnvelope(validAgent.account, { domain: 'evil.example.com', nonce: randomNonce() });
    const res = await post(normal.baseUrl, '/api/v1/whatever', { Authorization: header });
    expectStatus(res, 401);
    expectBodyMatch(res.body, (b) => /domain mismatch/i.test(b.error?.message ?? ''), 'domain mismatch');
  });

  await check('requireValidPass: X-API-Key alone is rejected (wallet-only route)', async () => {
    const res = await post(normal.baseUrl, '/api/v1/agent-only', { 'X-API-Key': 'test-key-abc' });
    expectStatus(res, 401);
    expectBodyMatch(res.body, (b) => /wallet authentication/i.test(b.error?.message ?? ''), 'wallet-only message');
  });

  await check('requireValidPass: wallet with pass → 200', async () => {
    const { header } = await signSiweEnvelope(validAgent.account, { nonce: randomNonce() });
    const res = await post(normal.baseUrl, '/api/v1/agent-only', { Authorization: header });
    expectStatus(res, 200);
  });

  await stop(normal.server);

  console.log('\nDisabled mode:');
  const disabled = await startServer({ siweDomain: 'localhost', disabled: true, validWallets: [validAgent.address] });

  await check('X-API-Key passes through (disabled mode)', async () => {
    const res = await post(disabled.baseUrl, '/api/v1/whatever', { 'X-API-Key': 'test-key-abc' });
    expectStatus(res, 200, 'disabled-apiKey');
  });

  await check('Wallet auth returns 401 DisabledMode in disabled mode', async () => {
    const { header } = await signSiweEnvelope(validAgent.account, { nonce: randomNonce() });
    const res = await post(disabled.baseUrl, '/api/v1/whatever', { Authorization: header });
    expectStatus(res, 401);
    expectBodyMatch(res.body, (b) => /unavailable/i.test(b.error?.message ?? ''), 'disabled message');
  });

  await stop(disabled.server);

  console.log('\nConstruction-time guards:');
  await check('Unknown tierKey throws MisconfiguredTierError', async () => {
    const { access } = buildServer();
    try {
      access.requireValidPassOrApiKey('nope', (req, res, next) => next());
      throw new Error('did not throw');
    } catch (err) {
      if (!/Unknown tierKey/.test(err.message)) throw err;
    }
  });

  await check('ProductionMockError fires when NODE_ENV != development', async () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const { Access: A } = await import('@skyemeta/access');
    try {
      new A({
        insumerApiKey: 'k',
        collections: { default: { address: '0x0', chain: 'base' } },
        localMode: { mockAttest: async () => true },
      });
      throw new Error('did not throw');
    } catch (err) {
      if (!/production-safety guard/i.test(err.message)) throw err;
    } finally {
      process.env.NODE_ENV = saved;
    }
  });

  await check('Short nonce TTL throws NonceTtlTooShortError', async () => {
    const { Access: A } = await import('@skyemeta/access');
    try {
      new A({
        insumerApiKey: 'k',
        collections: { default: { address: '0x0', chain: 'base' } },
        nonceStore: { has: () => false, set: () => {}, ttlMs: 1000 },
      });
      throw new Error('did not throw');
    } catch (err) {
      if (!/shorter than the 6-minute minimum/i.test(err.message)) throw err;
    }
  });

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}: ${f.err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(2);
});
