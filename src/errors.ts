export class AccessError extends Error {
  readonly suggestedStatus: number;
  constructor(message: string, suggestedStatus: number) {
    super(message);
    this.name = this.constructor.name;
    this.suggestedStatus = suggestedStatus;
  }
}

export class MissingAuthError extends AccessError {
  constructor() {
    super('Authentication required', 401);
  }
}

export class InvalidSignatureError extends AccessError {
  constructor(detail?: string) {
    super(detail ? `Invalid wallet signature: ${detail}` : 'Invalid wallet signature', 401);
  }
}

export class ExpiredSignatureError extends AccessError {
  constructor() {
    super('Signed message expired; please sign a fresh request', 401);
  }
}

export class FutureSignatureError extends AccessError {
  constructor() {
    super('Server time mismatch; please retry', 401);
  }
}

export class ReplayedNonceError extends AccessError {
  constructor() {
    super('Replay detected; please sign a fresh request', 401);
  }
}

export class InvalidPassError extends AccessError {
  constructor() {
    super('Wallet does not hold a valid access token', 401);
  }
}

export class AttestUnreachableError extends AccessError {
  constructor() {
    super('Verification service temporarily unavailable; please retry', 503);
  }
}

/**
 * Thrown when InsumerAPI /v1/attest returns 402 (Insufficient credits).
 * Adopter's InsumerAPI key needs a top-up. Distinct from AttestUnreachableError
 * so adopters can alert on credit drawdown separately from genuine outages.
 * Client-facing status (503) and opaque message match AttestUnreachableError
 * — the distinction lives at the error-class level for adopter-side handling.
 */
export class InsumerCreditsExhaustedError extends AccessError {
  constructor() {
    super('Verification service temporarily unavailable; please retry', 503);
  }
}

export class DisabledModeError extends AccessError {
  constructor() {
    super('Wallet authentication is currently unavailable', 401);
  }
}

export class MisconfiguredTierError extends Error {
  constructor(tierKey: string, validKeys: string[]) {
    super(`Unknown tierKey '${tierKey}'. Valid keys: [${validKeys.map(k => `'${k}'`).join(', ')}].`);
    this.name = 'MisconfiguredTierError';
  }
}

export class ProductionMockError extends Error {
  constructor(nodeEnv: string | undefined) {
    super(
      `@skyemeta/access: localMode.mockAttest is set but NODE_ENV is "${nodeEnv ?? 'unset'}". ` +
      `This is a production-safety guard. Set NODE_ENV=development to enable mock mode, or remove the localMode config.`,
    );
    this.name = 'ProductionMockError';
  }
}

export class NonceTtlTooShortError extends Error {
  constructor(actualMs: number) {
    super(
      `@skyemeta/access: nonceStore ttlMs is ${actualMs}ms, which is shorter than the 6-minute minimum (360000ms). ` +
      `SIWE timestamp window is 5 minutes + 10s skew; nonces must outlive valid signatures.`,
    );
    this.name = 'NonceTtlTooShortError';
  }
}
