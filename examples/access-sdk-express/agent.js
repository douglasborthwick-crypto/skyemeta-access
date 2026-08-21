import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

// Anvil/Hardhat local-testnet account #0 — a publicly documented test key, not a secret.
// Its address is 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266. Never fund this key or reuse it outside local examples.
export const VALID_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

export function newAgent(privateKey = generatePrivateKey()) {
  const account = privateKeyToAccount(privateKey);
  return { privateKey, account, address: account.address };
}

export async function signSiweEnvelope(account, opts) {
  const {
    domain = 'localhost',
    uri = 'http://localhost:3000/api/v1/whatever',
    chainId = 8453,
    nonce = randomNonce(),
    issuedAt = new Date().toISOString(),
    statement = 'This is a sign-in request for the InsumerAPI access pass.',
  } = opts ?? {};

  const message =
    `${domain} wants you to sign in with your Ethereum account:\n` +
    `${account.address}\n\n` +
    `${statement}\n\n` +
    `URI: ${uri}\n` +
    `Version: 1\n` +
    `Chain ID: ${chainId}\n` +
    `Nonce: ${nonce}\n` +
    `Issued At: ${issuedAt}`;

  const signature = await account.signMessage({ message });
  const envelope = JSON.stringify({ message, signature });
  return { header: 'Wallet ' + Buffer.from(envelope).toString('base64'), message, signature, nonce };
}

export function randomNonce() {
  return [...crypto.getRandomValues(new Uint8Array(8))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
