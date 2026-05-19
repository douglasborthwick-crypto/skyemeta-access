import { recoverMessageAddress } from 'viem';
import {
  ExpiredSignatureError,
  FutureSignatureError,
  InvalidSignatureError,
  MissingAuthError,
  ReplayedNonceError,
} from './errors.js';
import type { NonceStore, ParsedSiwe, SiweEnvelope } from './types.js';

const SIGNATURE_PAST_MS = 5 * 60 * 1000;
const SIGNATURE_FUTURE_SKEW_MS = 10 * 1000;
const NONCE_RECORD_TTL_MS = 10 * 60 * 1000;

export function extractEnvelope(authorizationHeader: string | undefined): SiweEnvelope {
  if (!authorizationHeader) throw new MissingAuthError();
  const match = authorizationHeader.match(/^Wallet\s+(.+)$/i);
  if (!match) throw new MissingAuthError();
  let decoded: string;
  try {
    decoded = Buffer.from(match[1].trim(), 'base64').toString('utf-8');
  } catch {
    throw new InvalidSignatureError('envelope is not valid base64');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new InvalidSignatureError('envelope is not valid JSON');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as Record<string, unknown>).message !== 'string' ||
    typeof (parsed as Record<string, unknown>).signature !== 'string'
  ) {
    throw new InvalidSignatureError('envelope must contain string message and signature');
  }
  return parsed as SiweEnvelope;
}

export function parseSiweMessage(message: string): ParsedSiwe {
  const domainMatch = message.match(/^([^\n]+?)\s+wants you to sign in with your Ethereum account:\s*\n(0x[a-fA-F0-9]{40})/);
  if (!domainMatch) throw new InvalidSignatureError('message missing EIP-4361 header');

  const uri = pickField(message, 'URI');
  const version = pickField(message, 'Version');
  const chainIdRaw = pickField(message, 'Chain ID');
  const nonce = pickField(message, 'Nonce');
  const issuedAt = pickField(message, 'Issued At');

  if (!uri || !version || !chainIdRaw || !nonce || !issuedAt) {
    throw new InvalidSignatureError('message missing required EIP-4361 fields');
  }

  const chainId = Number(chainIdRaw);
  if (!Number.isFinite(chainId)) throw new InvalidSignatureError('chain id is not numeric');

  const statementMatch = message.match(/^[^\n]+\n0x[a-fA-F0-9]{40}\n\n([^\n]+)\n/);

  return {
    domain: domainMatch[1].trim(),
    address: domainMatch[2],
    uri,
    version,
    chainId,
    nonce,
    issuedAt,
    statement: statementMatch?.[1],
  };
}

function pickField(message: string, label: string): string | undefined {
  const re = new RegExp(`^${label}:\\s*(.+)$`, 'm');
  return message.match(re)?.[1]?.trim();
}

export async function verifySiwe(
  envelope: SiweEnvelope,
  options: {
    nonceStore: NonceStore;
    siweDomain?: string;
    now?: () => number;
  },
): Promise<{ wallet: string; parsed: ParsedSiwe }> {
  const parsed = parseSiweMessage(envelope.message);

  const now = options.now ? options.now() : Date.now();
  const issuedAtMs = Date.parse(parsed.issuedAt);
  if (!Number.isFinite(issuedAtMs)) {
    throw new InvalidSignatureError('issuedAt is not a valid ISO 8601 timestamp');
  }
  if (issuedAtMs > now + SIGNATURE_FUTURE_SKEW_MS) throw new FutureSignatureError();
  if (now - issuedAtMs > SIGNATURE_PAST_MS) throw new ExpiredSignatureError();

  if (options.siweDomain && parsed.domain !== options.siweDomain) {
    throw new InvalidSignatureError(
      `domain mismatch: signed for '${parsed.domain}', expected '${options.siweDomain}'`,
    );
  }

  let recovered: string;
  try {
    recovered = await recoverMessageAddress({
      message: envelope.message,
      signature: envelope.signature as `0x${string}`,
    });
  } catch (err) {
    throw new InvalidSignatureError(
      err instanceof Error ? err.message : 'signature recovery failed',
    );
  }

  if (recovered.toLowerCase() !== parsed.address.toLowerCase()) {
    throw new InvalidSignatureError('recovered address does not match address in message');
  }

  const replayed = await options.nonceStore.has(parsed.nonce);
  if (replayed) throw new ReplayedNonceError();
  await options.nonceStore.set(parsed.nonce, NONCE_RECORD_TTL_MS);

  return { wallet: recovered, parsed };
}
