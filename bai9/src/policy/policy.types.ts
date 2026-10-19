/**
 * TANG CHINH SACH - chi mo ta "chan cai gi, nguong bao nhieu". Khong chua logic thuc thi hay luu tru.
 */

/** enforce: chan that.  shadow: chi ghi log "le ra da chan" (de do chan nham truoc khi bat).  off: tat. */
export type LayerMode = 'enforce' | 'shadow' | 'off';
export const LAYER_MODES: readonly LayerMode[] = ['enforce', 'shadow', 'off'];

export interface RateRule {
  limit: number;
  windowMs: number;
}

export interface VelocityPolicy {
  mode: LayerMode;
  perAccount: { browse: RateRule; order: RateRule };
  perDevice: { browse: RateRule; order: RateRule };
}

export interface AccountFarmPolicy {
  mode: LayerMode;
  /** So tai khoan khac nhau toi da tren 1 thiet bi trong `windowMs`. */
  maxAccountsPerDevice: number;
  windowMs: number;
}

export interface JourneyPolicy {
  mode: LayerMode;
  /** Thoi gian toi thieu tu luc mo trang san pham den luc dat hang. Nguoi that can bam, chon, xac nhan. */
  minDwellMs: number;
  /** Ve hanh trinh het han sau khoang nay. */
  tokenTtlMs: number;
}

export interface PurchaseQuotaPolicy {
  mode: LayerMode;
  /** So san pham toi da moi tai khoan / moi san pham flash sale. */
  maxUnitsPerAccount: number;
  /** So san pham toi da moi so dien thoai nhan hang / moi san pham (chan gom hang qua nhieu tai khoan). */
  maxUnitsPerPhone: number;
  /** Thoi gian ap dung han muc (do dai dot sale). */
  windowMs: number;
}

export interface ShieldPolicy {
  velocity: VelocityPolicy;
  accountFarm: AccountFarmPolicy;
  journey: JourneyPolicy;
  purchaseQuota: PurchaseQuotaPolicy;
}

export type LayerId = keyof ShieldPolicy;
export const LAYER_IDS: readonly LayerId[] = ['velocity', 'accountFarm', 'journey', 'purchaseQuota'];

export interface VersionedPolicy {
  version: number;
  updatedAt: string;
  updatedBy: string;
  reason: string;
  policy: ShieldPolicy;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
