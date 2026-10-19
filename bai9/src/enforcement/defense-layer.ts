import { LayerId, ShieldPolicy } from '../policy/policy.types';

export type ShieldAction = 'browse' | 'order';

/** Moi thu mot lop phong thu can biet ve request - da duoc tang HTTP chuan hoa. */
export interface ShieldContext {
  requestId: string;
  action: ShieldAction;
  method: string;
  path: string;
  productId: string;
  accountId: string;
  deviceId: string;
  ip: string;
  userAgent: string;
  quantity?: number;
  /** So dien thoai nhan hang da chuan hoa (0xxxxxxxxx). */
  phone?: string;
  saleToken?: string;
  now: number;
}

export interface BlockVerdict {
  blocked: true;
  /** Quy tac cu the trong chinh sach, vd. "perAccount.browse". */
  rule: string;
  /** Ma loi on dinh cho client / dashboard, vd. "VELOCITY_LIMIT". */
  code: string;
  status: number;
  message: string;
  threshold: unknown;
  observed: unknown;
  retryAfterSec?: number;
}

export interface PassVerdict {
  blocked: false;
  /** Hoan lai phan da giu cho (vd. han muc mua) neu buoc sau that bai. */
  release?: () => Promise<void>;
}

export type LayerVerdict = PassVerdict | BlockVerdict;

/**
 * Mot lop phong thu: nhan dien MOT loai hanh vi lam dung. Doc nguong tu `policy` (truyen vao moi lan
 * -> doi nguong co hieu luc ngay), doc/ghi bo dem qua CounterStore. Khong biet gi ve HTTP.
 */
export interface DefenseLayer {
  readonly id: LayerId;
  readonly title: string;
  appliesTo(action: ShieldAction): boolean;
  evaluate(ctx: ShieldContext, policy: ShieldPolicy): Promise<LayerVerdict>;
}

export const DEFENSE_LAYERS = Symbol('DEFENSE_LAYERS');
export const PASS: PassVerdict = { blocked: false };
