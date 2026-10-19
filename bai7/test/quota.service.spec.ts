/**
 * Quy tac han muc cua tung goi, kiem o tang QuotaService (nhanh, chay duoc ca 200.000 request/ngay).
 */
import { DAY, HOUR, MINUTE, PLANS, SECOND } from '../src/quota/plans';
import { QuotaService } from '../src/quota/quota.service';
import { T0, blockedTiers, run, tier } from './helpers';

describe('QuotaService', () => {
  let quota: QuotaService;
  beforeEach(() => {
    quota = new QuotaService();
  });

  describe('Quy tac 1 - Free: 60/phut + 5.000/ngay', () => {
    it('request thu 61 trong cung 1 phut bi chan boi tang Minute', () => {
      const r = run(quota, 'seller:f', 'free', 61, () => T0);

      expect(r.allowed).toBe(60);
      expect(blockedTiers(r.last)).toEqual(['Minute']);
    });

    it('rai deu 40 request/phut (khong cham tang phut): request thu 5.001 trong ngay bi chan boi tang Day', () => {
      const r = run(quota, 'seller:f', 'free', 5_001, (i) => T0 + i * 1.5 * SECOND);

      expect(r.allowed).toBe(5_000);
      expect(blockedTiers(r.last)).toEqual(['Day']);
    });

    it('sang ngay moi (00:00 gio Viet Nam) han muc ngay duoc lam moi', () => {
      run(quota, 'seller:f', 'free', 5_000, (i) => T0 + i * 1.5 * SECOND);
      const nextDay = T0 - HOUR + DAY; // 00:00 ngay hom sau gio Viet Nam

      expect(quota.consume('seller:f', 'free', undefined, nextDay - 1).allowed).toBe(false);
      expect(quota.consume('seller:f', 'free', undefined, nextDay).allowed).toBe(true);
    });
  });

  describe('Quy tac 2 - Pro: 600/phut + 200.000/ngay', () => {
    it('request thu 601 trong cung 1 phut bi chan boi tang Minute', () => {
      const r = run(quota, 'seller:p', 'pro', 601, () => T0);

      expect(r.allowed).toBe(600);
      expect(blockedTiers(r.last)).toEqual(['Minute']);
    });

    it('rai deu 500 request/phut: request thu 200.001 trong ngay bi chan boi tang Day', () => {
      const r = run(quota, 'seller:p', 'pro', 200_001, (i) => T0 + i * 120);

      expect(r.allowed).toBe(200_000);
      expect(blockedTiers(r.last)).toEqual(['Day']);
    });
  });

  describe('Quy tac 3 - Enterprise: 6.000/phut, khong gioi han ngay', () => {
    it('request thu 6.001 trong cung 1 phut bi chan boi tang Minute', () => {
      const r = run(quota, 'seller:e', 'enterprise', 6_001, () => T0);

      expect(r.allowed).toBe(6_000);
      expect(blockedTiers(r.last)).toEqual(['Minute']);
    });

    it('khong co tang Day: 300.000 request trong 1 gio (vuot ca han muc ngay cua Pro) deu qua', () => {
      const r = run(quota, 'seller:e', 'enterprise', 300_000, (i) => T0 + i * 12);

      expect(r.allowed).toBe(300_000);
      expect(r.last.tiers.map((t) => t.name)).toEqual(['Minute']);
    });
  });

  describe('Quy tac 4 - Xuat bao cao: 10/gio cho MOI goi', () => {
    it.each(PLANS)('goi %s: lan thu 11 trong 1 gio bi chan boi tang Export-Hour', (plan) => {
      const r = run(quota, `seller:${plan}`, plan, 11, (i) => T0 + i * MINUTE, 'report-export');

      expect(r.allowed).toBe(10);
      expect(blockedTiers(r.last)).toEqual(['Export-Hour']);
    });

    it('chinh xac theo 60 phut truot: 10 lan o phut 59, toi phut 61 van bi chan; qua 60 phut ke tu lan dau thi duoc', () => {
      const first = T0 + 59 * MINUTE;
      run(quota, 'seller:e', 'enterprise', 10, () => first, 'report-export');

      expect(quota.consume('seller:e', 'enterprise', 'report-export', T0 + 61 * MINUTE).allowed).toBe(false);
      expect(quota.consume('seller:e', 'enterprise', 'report-export', first + HOUR).allowed).toBe(true);
    });

    it('xuat bao cao cung tinh vao han muc phut cua goi: Free 10 lan xuat + 50 lan thuong -> lan 61 bi chan', () => {
      run(quota, 'seller:f', 'free', 10, () => T0, 'report-export');
      const r = run(quota, 'seller:f', 'free', 51, () => T0);

      expect(r.allowed).toBe(50);
      expect(blockedTiers(r.last)).toEqual(['Minute']);
    });
  });

  describe('Nhieu tang cung luc - tat ca hoac khong', () => {
    it('lan xuat thu 11 bi chan KHONG an vao han muc phut / ngay', () => {
      run(quota, 'seller:f', 'free', 10, () => T0, 'report-export');
      run(quota, 'seller:f', 'free', 5, () => T0, 'report-export'); // 5 lan bi chan

      const next = quota.consume('seller:f', 'free', undefined, T0);
      expect(tier(next, 'Minute')?.remaining).toBe(60 - 11);
      expect(tier(next, 'Day')?.remaining).toBe(5_000 - 11);
    });

    it('request bi chan boi tang phut KHONG an vao han muc ngay', () => {
      run(quota, 'seller:f', 'free', 100, () => T0); // 60 qua, 40 bi chan

      const next = quota.consume('seller:f', 'free', undefined, T0 + 2 * MINUTE);
      expect(tier(next, 'Day')?.remaining).toBe(5_000 - 61);
    });

    it('Retry-After chinh xac: cho dung so giay de nghi thi duoc, som hon 1 giay thi van bi chan', () => {
      const at = T0 + 10 * SECOND;
      const blocked = run(quota, 'seller:f', 'free', 61, () => at).last;
      const retryAfter = tier(blocked, 'Minute')!.retryAfterSeconds;

      expect(quota.consume('seller:f', 'free', undefined, at + (retryAfter - 1) * SECOND).allowed).toBe(false);
      expect(quota.consume('seller:f', 'free', undefined, at + retryAfter * SECOND).allowed).toBe(true);
    });
  });

  describe('Bay 1 - Doi goi giua chung co hieu luc ngay', () => {
    it('Free da het 60/phut -> nang Pro -> request ke tiep trong CUNG phut duoc qua, con 539', () => {
      expect(run(quota, 'seller:u', 'free', 61, () => T0).last.allowed).toBe(false);

      const afterUpgrade = quota.consume('seller:u', 'pro', undefined, T0 + SECOND);

      expect(afterUpgrade.allowed).toBe(true);
      expect(tier(afterUpgrade, 'Minute')).toMatchObject({ limit: 600, remaining: 600 - 61 });
      expect(tier(afterUpgrade, 'Day')).toMatchObject({ limit: 200_000, remaining: 200_000 - 61 });
    });

    it('Free da het 5.000/ngay -> nang Pro -> duoc goi tiep ngay trong ngay', () => {
      run(quota, 'seller:u', 'free', 5_001, (i) => T0 + i * 1.5 * SECOND);
      const later = T0 + 5_001 * 1.5 * SECOND;

      expect(quota.consume('seller:u', 'free', undefined, later).allowed).toBe(false);
      expect(quota.consume('seller:u', 'pro', undefined, later).allowed).toBe(true);
    });

    it('Pro het 600/phut -> nang Enterprise -> qua ngay, tang Day bien mat', () => {
      expect(run(quota, 'seller:u', 'pro', 601, () => T0).last.allowed).toBe(false);

      const r = quota.consume('seller:u', 'enterprise', undefined, T0 + SECOND);
      expect(r.allowed).toBe(true);
      expect(r.tiers.map((t) => t.name)).toEqual(['Minute']);
    });

    it('Ha goi Enterprise -> Free khi da dung 100 request trong phut -> bi chan ngay', () => {
      run(quota, 'seller:d', 'enterprise', 100, () => T0);

      expect(quota.consume('seller:d', 'free', undefined, T0 + SECOND).allowed).toBe(false);
    });

    it('Nang goi KHONG lam moi han muc xuat bao cao (han muc nay khong phu thuoc goi)', () => {
      run(quota, 'seller:u', 'free', 10, () => T0, 'report-export');

      expect(quota.consume('seller:u', 'enterprise', 'report-export', T0 + SECOND).allowed).toBe(false);
    });
  });

  describe('Co lap giua cac nha ban hang', () => {
    it('seller A het han muc khong anh huong seller B cung goi', () => {
      run(quota, 'seller:A', 'free', 100, () => T0);

      expect(run(quota, 'seller:B', 'free', 60, () => T0).allowed).toBe(60);
    });
  });
});
