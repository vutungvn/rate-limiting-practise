import { Limiter } from '../algorithms/types';
import { MemorySlotStore } from '../distributed/slot-store';
import { PaymentRateLimiter, PaymentRateLimiterOptions, RateLimitRejectedError } from '../distributed/payment-rate-limiter';
import { maxInAnyWindow, percentile, windowsOver } from './metrics';
import { Arrival, TrafficProfile, rng } from './traffic';

export const BANK_LIMIT = 3_000;
/** Do tre mang tu cong thanh toan toi ngan hang dao dong 0-20 ms -> cac request co the "don" lai. */
export const NETWORK_JITTER_MS = 20;

export interface SimResult {
  name: string;
  /** So request toi ngan hang nhieu nhat trong bat ky 1 giay nao. */
  maxPerSecond: number;
  /** So lan (khoang 1 giay) vuot 3.000 -> > 0 la bi cat ket noi 15 phut. */
  violations: number;
  rejectedNormal: number;
  rejectedPeak: number;
  rejectedTotal: number;
  delayP99Ms: number;
  delayMaxMs: number;
}

interface Outcome {
  arrival: Arrival;
  delayMs: number | null; // null = bi tu choi
}

function summarize(name: string, outcomes: Outcome[], profile: TrafficProfile): SimResult {
  const jitter = rng(profile.seed + 1);
  const spikeStart = profile.spike.startS * 1_000;
  const bankArrivals: number[] = [];
  const delays: number[] = [];
  let rejectedNormal = 0;
  let rejectedPeak = 0;
  for (const o of outcomes) {
    if (o.delayMs === null) {
      if (o.arrival.t < spikeStart) rejectedNormal++;
      else rejectedPeak++;
      continue;
    }
    delays.push(o.delayMs);
    bankArrivals.push(o.arrival.t + o.delayMs + jitter() * NETWORK_JITTER_MS);
  }
  bankArrivals.sort((a, b) => a - b);
  delays.sort((a, b) => a - b);
  return {
    name,
    maxPerSecond: maxInAnyWindow(bankArrivals),
    violations: windowsOver(bankArrivals, BANK_LIMIT),
    rejectedNormal,
    rejectedPeak,
    rejectedTotal: rejectedNormal + rejectedPeak,
    delayP99Ms: Math.round(percentile(delays, 99)),
    delayMaxMs: Math.round(delays[delays.length - 1] ?? 0),
  };
}

/** Mot bo gioi han dung chung cho ca 6 tien trinh (tuong duong dat no tren Redis). */
export function simulateShared(name: string, limiter: Limiter, arrivals: Arrival[], profile: TrafficProfile): SimResult {
  const outcomes = arrivals.map((arrival) => {
    const d = limiter.tryAcquire('bank', arrival.t);
    return { arrival, delayMs: d.allowed ? d.delayMs : null };
  });
  return summarize(name, outcomes, profile);
}

/** Moi tien trinh mot bo gioi han rieng voi 1/6 han muc, khong dong bo (chia tinh). */
export function simulatePartitioned(
  name: string,
  makeLimiter: () => Limiter,
  arrivals: Arrival[],
  profile: TrafficProfile,
): SimResult {
  const limiters = profile.lbWeights.map(makeLimiter);
  const outcomes = arrivals.map((arrival) => {
    const d = limiters[arrival.process].tryAcquire('bank', arrival.t);
    return { arrival, delayMs: d.allowed ? d.delayMs : null };
  });
  return summarize(name, outcomes, profile);
}

export interface Incident {
  /** Kho (Redis) khong tra loi trong [downFromS, upAtS). */
  downFromS: number;
  upAtS: number;
  /** Khi len lai la mot replica da mat TAT (failover mat du lieu). */
  wipeOnRecovery: boolean;
}

/**
 * Chay DUNG ma nguon trien khai: 6 PaymentRateLimiter (6 tien trinh) dung chung 1 MemorySlotStore
 * (cung ngu nghia voi Redis + Lua). Dong ho gia lap dieu khien ca kho lan tien trinh.
 */
export async function simulateDistributed(
  name: string,
  options: Omit<PaymentRateLimiterOptions, 'key' | 'now'>,
  arrivals: Arrival[],
  profile: TrafficProfile,
  incident?: Incident,
): Promise<SimResult> {
  let nowMs = 0;
  const store = new MemorySlotStore(() => Math.round(nowMs * 1_000));
  const processes = profile.lbWeights.map(
    () => new PaymentRateLimiter(store, { ...options, key: 'bank', now: () => nowMs }),
  );

  const outcomes: Outcome[] = [];
  let wiped = false;
  for (const arrival of arrivals) {
    nowMs = arrival.t;
    if (incident) {
      const down = nowMs >= incident.downFromS * 1_000 && nowMs < incident.upAtS * 1_000;
      store.failing = down;
      if (!down && nowMs >= incident.upAtS * 1_000 && incident.wipeOnRecovery && !wiped) {
        store.wipe();
        wiped = true;
      }
    }
    try {
      const permit = await processes[arrival.process].acquire();
      outcomes.push({ arrival, delayMs: permit.waitMs });
    } catch (e) {
      if (!(e instanceof RateLimitRejectedError)) throw e;
      outcomes.push({ arrival, delayMs: null });
    }
  }
  return summarize(name, outcomes, profile);
}
