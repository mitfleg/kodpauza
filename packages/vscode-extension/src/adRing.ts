import { KodpauzaAd } from './types';

export const MIN_AD_RING_SIZE = 3;
export const MAX_AD_RING_SIZE = 10;
export const DEFAULT_AD_RING_SIZE = 6;
export const DEFAULT_AD_RING_TTL_MS = 2 * 60 * 1_000;

interface AdRingEntry {
  ad: KodpauzaAd;
  expiresAtMs: number;
}

/**
 * A short-lived, in-memory inventory for one active AI wait session.
 *
 * Campaign and advertiser history intentionally survives refills. It is reset
 * only after every currently available candidate conflicts with the history,
 * which means a repeat is used only after the local set has been exhausted.
 */
export class AdRing {
  private readonly entries: AdRingEntry[] = [];
  private readonly usedCampaigns = new Set<string>();
  private readonly usedAdvertisers = new Set<string>();

  constructor(
    readonly capacity = DEFAULT_AD_RING_SIZE,
    private readonly fallbackTtlMs = DEFAULT_AD_RING_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(capacity) || capacity < MIN_AD_RING_SIZE || capacity > MAX_AD_RING_SIZE) {
      throw new Error(`Ad ring capacity must be between ${MIN_AD_RING_SIZE} and ${MAX_AD_RING_SIZE}.`);
    }
    if (!Number.isFinite(fallbackTtlMs) || fallbackTtlMs <= 0) {
      throw new Error('Ad ring fallback TTL must be positive.');
    }
  }

  get size(): number {
    this.purgeExpired();
    return this.entries.length;
  }

  add(ad: KodpauzaAd): boolean {
    this.purgeExpired();
    if (this.entries.length >= this.capacity) return false;
    if (this.entries.some((entry) => entry.ad.adId === ad.adId)) return false;
    if (this.entries.some((entry) => entry.ad.campaignId === ad.campaignId)) return false;

    const expiresAtMs = ad.expiresAt ? Date.parse(ad.expiresAt) : this.now() + this.fallbackTtlMs;
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= this.now()) return false;
    this.entries.push({ ad, expiresAtMs });
    return true;
  }

  take(): KodpauzaAd | undefined {
    this.purgeExpired();
    if (this.entries.length === 0) return undefined;

    let index = this.entries.findIndex(
      ({ ad }) =>
        !this.usedCampaigns.has(ad.campaignId) &&
        !this.usedAdvertisers.has(advertiserKey(ad.advertiserName)),
    );
    if (index < 0) {
      this.usedCampaigns.clear();
      this.usedAdvertisers.clear();
      index = 0;
    }

    const [entry] = this.entries.splice(index, 1);
    if (!entry) return undefined;
    this.usedCampaigns.add(entry.ad.campaignId);
    this.usedAdvertisers.add(advertiserKey(entry.ad.advertiserName));
    return entry.ad;
  }

  clear(): void {
    this.entries.length = 0;
    this.usedCampaigns.clear();
    this.usedAdvertisers.clear();
  }

  private purgeExpired(): void {
    const now = this.now();
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      if (this.entries[index]!.expiresAtMs <= now) this.entries.splice(index, 1);
    }
  }
}

function advertiserKey(value: string): string {
  return value.trim().toLowerCase();
}
