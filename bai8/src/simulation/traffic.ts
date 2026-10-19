/** Sinh so ngau nhien co hat giong (mulberry32) - moi lan chay cho cung ket qua. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Arrival {
  /** Thoi diem request toi cong thanh toan (ms). */
  t: number;
  /** Tien trinh duoc bo can bang tai chon (0..5). */
  process: number;
}

export interface TrafficProfile {
  durationS: number;
  baseRps: number;
  spike: { startS: number; durationS: number; multiplier: number };
  /** Ti le bo can bang tai chia cho tung tien trinh (tong = 1). */
  lbWeights: number[];
  seed: number;
}

/** Kich ban de bai: 2.000 rps, khung 20h-22h co dot x2,5 trong 30 giay; bo can bang tai chia khong deu. */
export const EXAM_PROFILE: TrafficProfile = {
  durationS: 150,
  baseRps: 2_000,
  spike: { startS: 40, durationS: 30, multiplier: 2.5 },
  lbWeights: [0.25, 0.2, 0.17, 0.15, 0.13, 0.1],
  seed: 20_22,
};

/** Luong den Poisson voi cuong do thay doi theo thoi gian. */
export function generateTraffic(p: TrafficProfile): Arrival[] {
  const random = rng(p.seed);
  const cumulative = p.lbWeights.map((_, i) => p.lbWeights.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const spikeStart = p.spike.startS * 1_000;
  const spikeEnd = spikeStart + p.spike.durationS * 1_000;
  const rateAt = (t: number) => (t >= spikeStart && t < spikeEnd ? p.baseRps * p.spike.multiplier : p.baseRps) / 1_000;

  const arrivals: Arrival[] = [];
  let t = 0;
  while (true) {
    t += -Math.log(1 - random()) / rateAt(t);
    if (t >= p.durationS * 1_000) break;
    const u = random();
    arrivals.push({ t, process: cumulative.findIndex((c) => u < c) });
  }
  return arrivals;
}
