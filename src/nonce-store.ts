import type { NonceStore } from './types.js';

export class InMemoryNonceStore implements NonceStore {
  readonly ttlMs: number;
  private readonly store = new Map<string, number>();

  constructor(ttlMs = 10 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  has(nonce: string): boolean {
    this.sweep();
    return this.store.has(nonce);
  }

  set(nonce: string, ttlMs: number): void {
    this.store.set(nonce, Date.now() + ttlMs);
  }

  private sweep(): void {
    if (this.store.size < 1024) return;
    const now = Date.now();
    for (const [nonce, expiresAt] of this.store) {
      if (expiresAt <= now) this.store.delete(nonce);
    }
  }
}
