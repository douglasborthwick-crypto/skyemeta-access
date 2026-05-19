import type { NonceStore } from './types.js';

export class InMemoryNonceStore implements NonceStore {
  readonly ttlMs: number;
  private readonly store = new Map<string, number>();

  constructor(ttlMs = 10 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  setIfAbsent(nonce: string, ttlMs: number): boolean {
    const now = Date.now();
    const existing = this.store.get(nonce);
    if (existing !== undefined && existing > now) {
      return false;
    }
    this.store.set(nonce, now + ttlMs);
    this.sweep(now);
    return true;
  }

  private sweep(now: number): void {
    if (this.store.size < 1024) return;
    for (const [nonce, expiresAt] of this.store) {
      if (expiresAt <= now) this.store.delete(nonce);
    }
  }
}
