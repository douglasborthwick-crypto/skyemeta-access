interface CacheEntry {
  pass: boolean;
  expiresAt: number;
}

export class AttestationCache {
  private readonly entries = new Map<string, CacheEntry>();
  constructor(private readonly ttlMs: number) {}

  get(wallet: string, collection: string): boolean | undefined {
    if (this.ttlMs === 0) return undefined;
    const entry = this.entries.get(key(wallet, collection));
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key(wallet, collection));
      return undefined;
    }
    return entry.pass;
  }

  getStale(wallet: string, collection: string): boolean | undefined {
    const entry = this.entries.get(key(wallet, collection));
    return entry?.pass;
  }

  set(wallet: string, collection: string, pass: boolean): void {
    if (this.ttlMs === 0) return;
    this.entries.set(key(wallet, collection), {
      pass,
      expiresAt: Date.now() + this.ttlMs,
    });
  }
}

function key(wallet: string, collection: string): string {
  return `${wallet.toLowerCase()}|${collection.toLowerCase()}`;
}
