/**
 * Mot loai cua so dem. Bo dem KHONG luu han muc: han muc duoc truyen vao moi lan hoi,
 * nho vay khi nha ban hang doi goi, han muc moi ap len chinh bo dem dang chay - co hieu luc ngay.
 */
export interface QuotaWindow {
  /** So request da dung trong cua so tai thoi diem `now` (co the la so thuc voi cua so truot). */
  used(key: string, now: number): number;
  /** Ghi nhan 1 request da duoc cho qua. */
  record(key: string, now: number): void;
  /** Con bao nhieu ms nua thi request tiep theo duoc cho qua (0 neu da duoc). */
  msUntilAllowed(key: string, now: number, limit: number): number;
  /** Con bao nhieu ms nua thi cua so lam moi (dung cho header Reset). */
  msUntilReset(key: string, now: number): number;
  clear(): void;
}
