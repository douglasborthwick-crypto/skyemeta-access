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

export type ChainName =
  | 'ethereum'
  | 'base'
  | 'optimism'
  | 'arbitrum'
  | 'polygon'
  | 'bnb'
  | 'avalanche'
  | 'fantom'
  | 'gnosis'
  | 'celo'
  | 'linea'
  | 'scroll'
  | 'zksync'
  | 'mantle'
  | 'blast'
  | 'mode'
  | 'zora'
  | 'taiko'
  | 'sei'
  | 'sonic'
  | 'unichain'
  | 'berachain'
  | 'ronin'
  | 'cronos'
  | 'opbnb'
  | 'metis'
  | 'kava'
  | 'moonbeam'
  | 'moonriver'
  | 'viction'
  | 'apechain';

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
  base: 8453,
  optimism: 10,
  arbitrum: 42161,
  polygon: 137,
  bnb: 56,
  avalanche: 43114,
  fantom: 250,
  gnosis: 100,
  celo: 42220,
  linea: 59144,
  scroll: 534352,
  zksync: 324,
  mantle: 5000,
  blast: 81457,
  mode: 34443,
  zora: 7777777,
  taiko: 167000,
  sei: 1329,
  sonic: 146,
  unichain: 130,
  berachain: 80094,
  ronin: 2020,
  cronos: 25,
  opbnb: 204,
  metis: 1088,
  kava: 2222,
  moonbeam: 1284,
  moonriver: 1285,
  viction: 88,
  apechain: 33139,
};
