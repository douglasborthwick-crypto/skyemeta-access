export interface NonceStore {
  /**
   * Atomically record a nonce as seen if it has not been seen before.
   * Returns true on first insert, false if the nonce was already present (replay).
   *
   * MUST be atomic: between the existence check and the insert, no other call
   * can observe a missing-then-present transition. In-memory implementations
   * achieve this naturally in single-threaded Node. Shared stores must use
   * primitives like Redis `SET NX` or Firestore transactions.
   */
  setIfAbsent(nonce: string, ttlMs: number): Promise<boolean> | boolean;
  ttlMs?: number;
}

export interface CollectionConfig {
  address: string;
  chain: ChainName;
}

// EVM chain names supported by InsumerAPI /v1/attest.
// Non-EVM chains (solana, xrpl, bitcoin, tron, stellar, sui) are reachable
// via direct /v1/attest only; the SDK's nft_ownership middleware is EVM-only in v1.
export type ChainName =
  | 'ethereum'
  | 'bnb'
  | 'base'
  | 'avalanche'
  | 'polygon'
  | 'arbitrum'
  | 'optimism'
  | 'chiliz'
  | 'soneium'
  | 'plume'
  | 'worldchain'
  | 'sonic'
  | 'gnosis'
  | 'mantle'
  | 'scroll'
  | 'linea'
  | 'zksync'
  | 'blast'
  | 'celo'
  | 'moonbeam'
  | 'opbnb'
  | 'unichain'
  | 'ink'
  | 'sei'
  | 'berachain'
  | 'apechain'
  | 'taiko'
  | 'ronin'
  | 'moonriver'
  | 'viction'
  | 'xdc';

export interface LocalModeConfig {
  mockAttest: (wallet: string, collection: string) => Promise<boolean> | boolean;
}

export interface AccessConfig {
  insumerApiKey: string;
  collections: Record<string, CollectionConfig>;
  nonceStore?: NonceStore;
  cacheTtlMs?: number;
  attestRetryCount?: number;
  siweDomain?: string;
  disabled?: boolean;
  localMode?: LocalModeConfig;
  attestBaseUrl?: string;
  jwksUrl?: string;
}

export interface SiweEnvelope {
  message: string;
  signature: string;
}

export interface ParsedSiwe {
  domain: string;
  address: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  statement?: string;
}

export interface AttestationResult {
  pass: boolean;
  conditionHash?: string;
  blockNumber?: string;
  blockTimestamp?: string;
  attestedAt?: string;
}

export const CHAIN_IDS: Record<ChainName, number> = {
  ethereum: 1,
  bnb: 56,
  base: 8453,
  avalanche: 43114,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  chiliz: 88888,
  soneium: 1868,
  plume: 98866,
  worldchain: 480,
  sonic: 146,
  gnosis: 100,
  mantle: 5000,
  scroll: 534352,
  linea: 59144,
  zksync: 324,
  blast: 81457,
  celo: 42220,
  moonbeam: 1284,
  opbnb: 204,
  unichain: 130,
  ink: 57073,
  sei: 1329,
  berachain: 80094,
  apechain: 33139,
  taiko: 167000,
  ronin: 2020,
  moonriver: 1285,
  viction: 88,
  xdc: 50,
};
