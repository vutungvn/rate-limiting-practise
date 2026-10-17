import { ThrottlerGetTrackerFunction } from '@nestjs/throttler';

// Mac dinh ThrottlerGuard dem theo IP. Quy tac nghiep vu lai la "moi tai khoan" va
// "moi so dien thoai", nen ta tu chon khoa dem cho tung endpoint.

/** Dem theo tai khoan da dang nhap; chua dang nhap thi dem theo IP. */
export const trackByAccount: ThrottlerGetTrackerFunction = (req) =>
  req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;

/** Dem theo so dien thoai nhan OTP, chuan hoa de "+84 912..." va "0912..." chung mot bo dem. */
export const trackByPhone: ThrottlerGetTrackerFunction = (req) => {
  const phone = normalizePhone(req.body?.phone);
  return phone ? `phone:${phone}` : `ip:${req.ip}`;
};

export function normalizePhone(raw: unknown): string {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('84')) digits = '0' + digits.slice(2);
  return digits;
}
