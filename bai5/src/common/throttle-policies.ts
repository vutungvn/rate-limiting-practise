// Tat ca nguong gioi han tan suat tap trung o mot cho, de doc va de review.
// Luu y: @nestjs/throttler v5+ dung don vi MILI-GIAY cho ttl.

/** Nguong chung cho moi endpoint khong khai bao rieng. */
export const GENERAL_LIMIT = { ttl: 60_000, limit: 100 };

/** Moi tai khoan toi da 3 don flash sale trong 60 giay. */
export const FLASH_SALE_LIMIT = { ttl: 60_000, limit: 3 };

/** Moi so dien thoai toi da 3 lan gui OTP trong 5 phut (moi SMS ton phi that). */
export const SEND_OTP_LIMIT = { ttl: 5 * 60_000, limit: 3 };
