/**
 * Loi cua gao ro dang hang doi, cai dat bang GCRA "virtual scheduling".
 *
 * Trang thai duy nhat moi khoa: TAT (theoretical arrival time) = thoi diem som nhat ma request
 * KE TIEP duoc phep gui. Moi request duoc cap mot "o gui" cach o truoc dung `intervalUs`:
 *   slot = max(now, TAT);  wait = slot - now
 *   wait > maxWait  -> tu choi (hang doi day), KHONG doi TAT
 *   nguoc lai       -> cho qua sau `wait`, TAT = slot + intervalUs
 *
 * Cac o gui cach nhau dung `intervalUs` -> trong bat ky 1 giay nao cung khong qua 1e6/intervalUs request.
 * Ham nay va script Lua trong redis-slot-store.ts la MOT logic: sua mot cho phai sua ca hai.
 * Dung so nguyen micro giay de Lua 5.1 cua Redis tinh chinh xac (khong mat phan le).
 */
export interface GcraResult {
  allowed: boolean;
  waitUs: number;
  /** TAT sau quyet dinh (dung cho viec khoi phuc sau su co, xem payment-rate-limiter.ts). */
  tatUs: number;
}

export function gcraReserve(
  storedTatUs: number | undefined,
  nowUs: number,
  intervalUs: number,
  maxWaitUs: number,
): GcraResult {
  const tat = storedTatUs === undefined || storedTatUs < nowUs ? nowUs : storedTatUs;
  const waitUs = tat - nowUs;
  if (waitUs > maxWaitUs) return { allowed: false, waitUs, tatUs: tat };
  return { allowed: true, waitUs, tatUs: tat + intervalUs };
}

/** Khoang cach giua hai o gui, lam tron LEN de toc do thuc te khong bao gio vuot `ratePerSec`. */
export const intervalUsFor = (ratePerSec: number) => Math.ceil(1_000_000 / ratePerSec);
