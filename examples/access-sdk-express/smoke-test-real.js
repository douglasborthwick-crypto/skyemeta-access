// smoke-test-real.js — end-to-end against the live InsumerAPI /v1/attest.
//
// Required env:
//   INSUMER_API_KEY        — InsumerAPI key
//   INSUMER_TEST_PRIVATE_KEY — private key for the wallet that holds an InsumerPass
//
// Costs ~2 InsumerAPI credits (positive + negative; replay is free,
// it short-circuits inside the SDK before hitting /v1/attest).

import { buildServer } from './server.js';
import { newAgent, signSiweEnvelope, randomNonce } from './agent.js';
import { privateKeyToAccount } from 'viem/accounts';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env: ${name}`);
    process.exit(2);
  }
  return v;
}

const apiKey = requireEnv('INSUMER_API_KEY');
const testPrivateKey = requireEnv('INSUMER_TEST_PRIVATE_KEY');

let passed = 0, failed = 0;
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
    throw new Error(`${label} expected status ${expected}, got ${res.status}: ${JSON.stringify(res.body)}`);
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

async function main() {
  console.log('\n@skyemeta/access — REAL-MODE smoke test (live /v1/attest)\n');

  const holder = newAgent(testPrivateKey);
  const nonHolder = newAgent();

  console.log(`Holder address:     ${holder.address}`);
  console.log(`Non-holder address: ${nonHolder.address}`);
  console.log(`API key:            ${apiKey.slice(0, 12)}…${apiKey.slice(-4)}`);
  console.log('');

  const { app } = buildServer({
    realMode: true,
    insumerApiKey: apiKey,
    siweDomain: 'localhost',
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://localhost:${server.address().port}`;

  try {
    await check('Holder signs SIWE → real /v1/attest returns pass → 200', async () => {
      const { header } = await signSiweEnvelope(holder.account, { nonce: randomNonce() });
      const res = await post(baseUrl, '/api/v1/whatever', { Authorization: header });
      expectStatus(res, 200, 'holder');
      if (res.body.via !== 'wallet') throw new Error(`expected via=wallet, got ${res.body.via}`);
      if (res.body.authenticatedAs?.toLowerCase() !== holder.address.toLowerCase()) {
        throw new Error(`expected authenticatedAs=${holder.address}, got ${res.body.authenticatedAs}`);
      }
    });

    await check('Non-holder signs SIWE → /v1/attest returns no-pass → 401', async () => {
      const { header } = await signSiweEnvelope(nonHolder.account, { nonce: randomNonce() });
      const res = await post(baseUrl, '/api/v1/whatever', { Authorization: header });
      expectStatus(res, 401, 'non-holder');
      if (!/valid access token/i.test(res.body.error?.message ?? '')) {
        throw new Error(`expected InvalidPass message, got: ${res.body.error?.message}`);
      }
    });

    await check('Replay (same envelope twice) → second is 401 ReplayedNonce (0 extra /v1/attest cost)', async () => {
      const { header } = await signSiweEnvelope(holder.account, { nonce: randomNonce() });
      const first = await post(baseUrl, '/api/v1/whatever', { Authorization: header });
      expectStatus(first, 200, 'first');
      const second = await post(baseUrl, '/api/v1/whatever', { Authorization: header });
      expectStatus(second, 401, 'replay');
      if (!/replay/i.test(second.body.error?.message ?? '')) {
        throw new Error(`expected replay message, got: ${second.body.error?.message}`);
      }
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}: ${f.err.message}`);
    process.exit(1);
  }
  console.log('\nReal-mode smoke test green. SDK is verified end-to-end against live /v1/attest.');
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(2);
});
