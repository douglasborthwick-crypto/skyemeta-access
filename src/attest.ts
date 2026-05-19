import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AttestUnreachableError, InvalidPassError } from './errors.js';
import type { CollectionConfig } from './types.js';
import { CHAIN_IDS } from './types.js';

export const DEFAULT_ATTEST_BASE_URL = 'https://api.insumermodel.com';
export const DEFAULT_JWKS_URL = 'https://api.insumermodel.com/.well-known/jwks.json';

const ATTEST_TIMEOUT_MS = 10_000;
const RETRY_BACKOFF_MS = 500;
const ISSUER = 'https://api.insumermodel.com';

interface AttestRequestBody {
  wallet: string;
  format: 'jwt';
  conditions: Array<{
    type: 'nft_ownership';
    contractAddress: string;
    chainId: number;
    label?: string;
  }>;
}

interface AttestEnvelope {
  ok: boolean;
  data?: {
    jwt?: string;
  };
  error?: { code: number; message: string };
}

export class AttestClient {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly insumerApiKey: string,
    private readonly retryCount: number,
    private readonly attestBaseUrl: string = DEFAULT_ATTEST_BASE_URL,
    jwksUrl: string = DEFAULT_JWKS_URL,
  ) {
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  async checkPass(wallet: string, collection: CollectionConfig): Promise<boolean> {
    const chainId = CHAIN_IDS[collection.chain];
    if (chainId === undefined) {
      throw new Error(`Unsupported chain '${collection.chain}' — InsumerAPI accepts EVM chain names like 'base', 'ethereum', 'optimism'.`);
    }
    const body: AttestRequestBody = {
      wallet,
      format: 'jwt',
      conditions: [
        {
          type: 'nft_ownership',
          contractAddress: collection.address,
          chainId,
          label: `holds @skyemeta/access pass from ${collection.address.slice(0, 8)}…`,
        },
      ],
    };

    const jwt = await this.callWithRetry(body);
    return await this.verifyJwt(jwt);
  }

  private async callWithRetry(body: AttestRequestBody): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retryCount; attempt++) {
      try {
        return await this.callOnce(body);
      } catch (err) {
        lastErr = err;
        if (err instanceof InvalidPassError) throw err;
        if (attempt < this.retryCount) {
          await sleep(RETRY_BACKOFF_MS);
        }
      }
    }
    throw new AttestUnreachableError(
      lastErr instanceof Error ? lastErr.message : 'unknown error',
    );
  }

  private async callOnce(body: AttestRequestBody): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ATTEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${this.attestBaseUrl}/v1/attest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.insumerApiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`/v1/attest returned HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const json = (await response.json()) as AttestEnvelope;
    if (!json.ok || !json.data?.jwt) {
      throw new Error(
        json.error?.message
          ? `/v1/attest envelope error: ${json.error.message}`
          : '/v1/attest response missing data.jwt (was format:"jwt" honored?)',
      );
    }
    return json.data.jwt;
  }

  private async verifyJwt(jwt: string): Promise<boolean> {
    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(jwt, this.jwks, {
        issuer: ISSUER,
        algorithms: ['ES256'],
      });
      payload = result.payload as Record<string, unknown>;
    } catch (err) {
      throw new AttestUnreachableError(
        `JWT verification failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
    return payload.pass === true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
