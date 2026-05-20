import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AttestUnreachableError, InsumerCreditsExhaustedError, InvalidPassError } from './errors.js';
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
    return await this.verifyJwt(jwt, wallet);
  }

  private async callWithRetry(body: AttestRequestBody): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retryCount; attempt++) {
      try {
        return await this.callOnce(body);
      } catch (err) {
        lastErr = err;
        if (err instanceof InvalidPassError) throw err;
        if (err instanceof InsumerCreditsExhaustedError) throw err;
        console.error(
          `@skyemeta/access: /v1/attest call failed (attempt ${attempt + 1}/${this.retryCount + 1}):`,
          err instanceof Error ? err.message : err,
        );
        if (attempt < this.retryCount) {
          await sleep(RETRY_BACKOFF_MS);
        }
      }
    }
    throw new AttestUnreachableError();
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
      if (response.status === 402) {
        console.error(
          '@skyemeta/access: /v1/attest returned 402 — InsumerAPI key is out of credits. ' +
          'Top up at https://insumermodel.com/developers/account/ or via POST /v1/credits/buy.',
        );
        throw new InsumerCreditsExhaustedError();
      }
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

  private async verifyJwt(jwt: string, expectedWallet: string): Promise<boolean> {
    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(jwt, this.jwks, {
        issuer: ISSUER,
        algorithms: ['ES256'],
      });
      payload = result.payload as Record<string, unknown>;
    } catch (err) {
      console.error(
        '@skyemeta/access: /v1/attest JWT verification failed:',
        err instanceof Error ? err.message : err,
      );
      throw new AttestUnreachableError();
    }
    const sub = payload.sub;
    if (typeof sub !== 'string' || sub.toLowerCase() !== expectedWallet.toLowerCase()) {
      console.error(
        `@skyemeta/access: /v1/attest JWT sub claim does not bind to requested wallet (expected ${expectedWallet}, got ${String(sub)})`,
      );
      throw new AttestUnreachableError();
    }
    return payload.pass === true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
