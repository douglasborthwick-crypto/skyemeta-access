// probe.js — raw /v1/attest sanity check.
// Verifies the live InsumerAPI surface matches what @skyemeta/access assumes
// BEFORE running the SDK against it.
//
// Required env:
//   INSUMER_API_KEY        — InsumerAPI key in X-API-Key header
//   INSUMER_TEST_ADDRESS   — wallet address that holds an InsumerPass on Base
//
// Costs 1 InsumerAPI credit.

import { decodeJwt, decodeProtectedHeader } from 'jose';

const COLLECTION = '0x3E2a408cc6eceba04FF9d04A5B8B05aBa8DD50ce';
const CHAIN_ID = 8453;
const ATTEST_URL = 'https://api.insumermodel.com/v1/attest';

const FAIL = '\x1b[31m✗\x1b[0m';
const PASS = '\x1b[32m✓\x1b[0m';
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
const wallet = requireEnv('INSUMER_TEST_ADDRESS');

let issues = 0;
function expect(cond, label, detail) {
  if (cond) {
    console.log(`  ${PASS} ${label}`);
  } else {
    console.log(`  ${FAIL} ${label}`);
    if (detail) console.log(`    ${DIM}${detail}${RESET}`);
    issues++;
  }
}

const body = {
  wallet,
  format: 'jwt',
  conditions: [
    {
      type: 'nft_ownership',
      contractAddress: COLLECTION,
      chainId: CHAIN_ID,
      label: 'InsumerAccess pass holder (probe)',
    },
  ],
};

console.log('\nProbing /v1/attest...');
console.log(`  Wallet:     ${wallet}`);
console.log(`  Collection: ${COLLECTION} (Base, chainId ${CHAIN_ID})`);
console.log(`  API key:    ${apiKey.slice(0, 12)}…${apiKey.slice(-4)}`);
console.log('');

const start = Date.now();
const response = await fetch(ATTEST_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
  body: JSON.stringify(body),
});
const elapsed = Date.now() - start;

console.log(`HTTP ${response.status} in ${elapsed}ms`);

if (!response.ok) {
  const text = await response.text();
  console.error('\nNon-OK response body:');
  console.error(text);
  process.exit(1);
}

const json = await response.json();
console.log('\nResponse envelope:');
console.log(JSON.stringify(json, null, 2));
console.log('');

console.log('Shape assertions (these are what the SDK expects):');
expect(json.ok === true, 'envelope.ok === true', `got: ${json.ok}`);
expect(json.data?.attestation, 'data.attestation present', `got: ${typeof json.data?.attestation}`);
expect(typeof json.data?.jwt === 'string', 'data.jwt is a string', `got: ${typeof json.data?.jwt}`);

if (typeof json.data?.jwt === 'string') {
  const jwt = json.data.jwt;
  let header, payload;
  try {
    header = decodeProtectedHeader(jwt);
    payload = decodeJwt(jwt);
  } catch (err) {
    expect(false, 'JWT parses', err.message);
  }

  if (header && payload) {
    console.log('\nDecoded JWT header:', JSON.stringify(header));
    console.log('Decoded JWT payload:', JSON.stringify(payload, null, 2));
    console.log('');

    console.log('JWT-level assertions:');
    expect(header.alg === 'ES256', 'header.alg === ES256', `got: ${header.alg}`);
    expect(typeof header.kid === 'string' && header.kid.length > 0, 'header.kid is a non-empty string', `got: ${header.kid}`);
    expect(typeof payload.iss === 'string', 'payload.iss is a string', `got: ${typeof payload.iss}`);
    expect(payload.iss === 'https://api.insumermodel.com', 'payload.iss === https://api.insumermodel.com', `got: ${payload.iss}`);
    expect(typeof payload.pass === 'boolean', 'payload.pass is a boolean', `got: ${typeof payload.pass}`);
    expect(typeof payload.iat === 'number', 'payload.iat is a number', `got: ${typeof payload.iat}`);
    expect(typeof payload.exp === 'number', 'payload.exp is a number', `got: ${typeof payload.exp}`);

    console.log('');
    if (payload.pass === true) {
      console.log(`${PASS} Wallet holds an InsumerPass — ready for SDK happy-path test.`);
    } else {
      console.log(`${FAIL} Wallet does NOT hold a valid InsumerPass.`);
      console.log(`  ${DIM}Either the mint hasn't run yet, the wrong address is in INSUMER_TEST_ADDRESS,`);
      console.log(`  or the on-chain state hasn't propagated. Check Basescan for the mint tx.${RESET}`);
    }
  }
}

console.log('');
if (issues > 0) {
  console.log(`${FAIL} ${issues} probe assertion(s) failed. SDK assumptions may need adjusting before running smoke-test-real.`);
  process.exit(1);
} else {
  console.log(`${PASS} All probe assertions green. Safe to proceed to smoke-test-real.`);
}
