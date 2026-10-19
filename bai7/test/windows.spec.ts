/**
 * Ba loai cua so dem dung cho ba tang.
 */
import { DAY, HOUR, MINUTE, SECOND, VN_UTC_OFFSET } from '../src/quota/plans';
import { FixedWindowCounter } from '../src/quota/windows/fixed-window-counter';
import { SlidingLog } from '../src/quota/windows/sliding-log';
import { SlidingWindowCounter } from '../src/quota/windows/sliding-window-counter';

const record = (w: { record(k: string, n: number): void }, n: number, at: number, key = 'k') => {
  for (let i = 0; i < n; i++) w.record(key, at);
};

describe('SlidingWindowCounter (tang phut)', () => {
  it('khoa moi -> used = 0, khong nem loi', () => {
    expect(new SlidingWindowCounter(MINUTE).used('never-seen', Date.now())).toBe(0);
  });

  it('tan cong bien: 60 o giay 59 -> o giay 61 uoc luong ~59, chan duoc dot thu hai', () => {
    const w = new SlidingWindowCounter(MINUTE);
    record(w, 60, 59 * SECOND);

    expect(w.used('k', 61 * SECOND)).toBeCloseTo(59, 0);
  });

  it('khoa bo trong 10 phut -> so dem cu het han', () => {
    const w = new SlidingWindowCounter(MINUTE);
    record(w, 60, 0);

    expect(w.used('k', 10 * MINUTE)).toBe(0);
  });
});

describe('FixedWindowCounter (tang ngay, reset 00:00 gio Viet Nam)', () => {
  const midnightVN = Date.UTC(2026, 9, 17, 17, 0, 0); // 00:00 18/10 gio VN = 17:00 17/10 UTC

  it('23:59:59 va 00:00:00 gio VN thuoc 2 ngay khac nhau', () => {
    const w = new FixedWindowCounter(DAY, VN_UTC_OFFSET);
    record(w, 5, midnightVN - SECOND);

    expect(w.used('k', midnightVN - 1)).toBe(5);
    expect(w.used('k', midnightVN)).toBe(0);
  });

  it('Reset dem nguoc toi 00:00 gio VN', () => {
    const w = new FixedWindowCounter(DAY, VN_UTC_OFFSET);

    expect(w.msUntilReset('k', midnightVN - HOUR)).toBe(HOUR);
  });
});

describe('SlidingLog (endpoint xuat bao cao)', () => {
  it('khong bao gio qua 10 lan trong bat ky 60 phut nao, ke ca o mep gio', () => {
    const w = new SlidingLog(HOUR);
    record(w, 10, 59 * MINUTE);

    expect(w.used('k', 61 * MINUTE)).toBe(10); // cua so truot uoc luong se chi con ~9.67
    expect(w.used('k', 59 * MINUTE + HOUR)).toBe(0);
  });

  it('msUntilAllowed = luc moc cu nhat het han', () => {
    const w = new SlidingLog(HOUR);
    for (let i = 0; i < 10; i++) w.record('k', i * MINUTE);

    expect(w.msUntilAllowed('k', 30 * MINUTE, 10)).toBe(30 * MINUTE);
  });
});
