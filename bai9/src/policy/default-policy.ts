import { ShieldPolicy } from './policy.types';

const SECOND = 1_000;
const HOUR = 3_600 * SECOND;

/**
 * Nguong mac dinh cho 11/11. Moi con so deu co gia dinh ve hanh vi nguoi that (README muc 2.3);
 * truoc ngay sale nen chay `shadow` tren luu luong that de hieu chinh.
 */
export const DEFAULT_POLICY: ShieldPolicy = {
  velocity: {
    mode: 'enforce',
    // Nguoi that tai lai trang luc 0h: ~1 lan/giay -> 10 lan/10s. Nguong 30 = gap 3 lan.
    perAccount: { browse: { limit: 30, windowMs: 10 * SECOND }, order: { limit: 5, windowMs: 10 * SECOND } },
    // Thiet bi dung chung trong gia dinh: gap doi nguong tai khoan.
    perDevice: { browse: { limit: 60, windowMs: 10 * SECOND }, order: { limit: 10, windowMs: 10 * SECOND } },
  },
  accountFarm: {
    mode: 'enforce',
    // Gia dinh 2-3 nguoi dung chung 1 may la binh thuong; tu tai khoan thu 4 la dau hieu trang trai.
    maxAccountsPerDevice: 3,
    windowMs: 1 * HOUR,
  },
  journey: {
    mode: 'enforce',
    // Nguoi that: mo trang -> chon so luong -> bam dat -> xac nhan: >= 1,5s. Bot: vai chuc ms.
    minDwellMs: 800,
    tokenTtlMs: 10 * 60 * SECOND,
  },
  purchaseQuota: {
    mode: 'enforce',
    maxUnitsPerAccount: 2,
    maxUnitsPerPhone: 2,
    windowMs: 24 * HOUR,
  },
};
