/**
 * TANG LUU TRU - chi biet "dem", "tap phan tu khac nhau", "tong co tran". Khong biet gi ve bot hay nguong.
 * Ban trong bo nho cho 1 tien trinh; chay nhieu tien trinh thi thay bang ban Redis cung interface
 * (moi thao tac duoi day tuong ung 1 Lua script nguyen tu).
 */
export interface CounterStore {
  /** Ghi nhan 1 lan va tra ve so lan trong cua so truot `windowMs` gan nhat (tinh ca lan nay). */
  hit(key: string, windowMs: number, now: number): Promise<number>;

  /** So phan tu khac nhau con hieu luc trong tap; `has` = tap da chua `member` chua. */
  distinct(key: string, member: string, now: number): Promise<{ size: number; has: boolean }>;
  /** Them `member` vao tap, het han sau `ttlMs`. */
  addDistinct(key: string, member: string, ttlMs: number, now: number): Promise<void>;

  /**
   * Cong `amount` vao tong NEU sau khi cong khong vuot `max` (kiem tra + cong la mot thao tac nguyen tu).
   * Tra ve tong hien tai va da cong hay chua.
   */
  addIfWithin(key: string, amount: number, max: number, ttlMs: number, now: number): Promise<{ ok: boolean; total: number }>;
  /** Hoan lai `amount` da cong (khi buoc sau that bai). */
  subtract(key: string, amount: number): Promise<void>;

  clear(): Promise<void>;
}

export const COUNTER_STORE = Symbol('COUNTER_STORE');
