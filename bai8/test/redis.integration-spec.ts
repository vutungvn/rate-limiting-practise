/**
 * Chay voi Redis THAT:  docker compose up -d   roi   REDIS_URL=redis://localhost:6379 npm test
 * Khong co REDIS_URL thi bo qua.
 */
import Redis from 'ioredis';
import { PaymentRateLimiter } from '../src/distributed/payment-rate-limiter';
import { RedisSlotStore } from '../src/distributed/redis-slot-store';

const url = process.env.REDIS_URL;
const describeRedis = url ? describe : describe.skip;

describeRedis('RedisSlotStore tren Redis that', () => {
  const clients: Redis[] = [];
  const key = `bank:test:${Date.now()}`;

  beforeAll(async () => {
    for (let i = 0; i < 6; i++) clients.push(new Redis(url!, { enableOfflineQueue: true, maxRetriesPerRequest: 0 }));
    await Promise.all(clients.map((c) => c.ping()));
  });
  afterAll(async () => {
    await clients[0].del(key);
    await Promise.all(clients.map((c) => c.quit()));
  });

  it('6 ket noi (6 tien trinh) xin 6.000 o DONG THOI: moi TAT tra ve khac nhau va cach deu dung 351 µs', async () => {
    const stores = clients.map((c) => new RedisSlotStore(c));
    const results = await Promise.all(Array.from({ length: 6_000 }, (_, i) => stores[i % 6].reserve(key, 351, 25_000_000)));

    const tats = results.map((r) => r.tatUs).sort((a, b) => a - b);
    expect(results.every((r) => r.allowed)).toBe(true);
    expect(new Set(tats).size).toBe(6_000);
    for (let i = 1; i < tats.length; i++) expect(tats[i] - tats[i - 1]).toBe(351);
  });

  it('khoa co TTL > 0 va khong het han khi con o gui trong tuong lai', async () => {
    expect(await clients[0].pttl(key)).toBeGreaterThan(1_000);
  });

  it('PaymentRateLimiter tren Redis that: tra waitMs tang dan', async () => {
    const limiter = new PaymentRateLimiter(new RedisSlotStore(clients[0]), {
      key: `${key}:limiter`,
      ratePerSec: 2_850,
      maxWaitMs: 25_000,
      storeTimeoutMs: 1_000,
    });
    const a = await limiter.acquire();
    const b = await limiter.acquire();
    expect(b.waitMs).toBeGreaterThan(a.waitMs);
    await clients[0].del(`${key}:limiter`);
  });
});
