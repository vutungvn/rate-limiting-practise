import { LAYER_MODES, ShieldPolicy } from './policy.types';

const SECOND = 1_000;
const DAY = 86_400 * SECOND;

type Check = (value: unknown) => string | null;

const int = (min: number, max: number): Check => (v) =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? null : `phai la so nguyen trong [${min}, ${max}]`;
const mode: Check = (v) => (LAYER_MODES.includes(v as never) ? null : `phai la mot trong: ${LAYER_MODES.join(', ')}`);
const rate = { limit: int(1, 100_000), windowMs: int(SECOND, DAY) };

/** Luoc do: moi la la mot ham kiem tra. Dung de kiem tra gia tri VA phat hien khoa la (go nham ten). */
const SCHEMA = {
  velocity: { mode, perAccount: { browse: rate, order: rate }, perDevice: { browse: rate, order: rate } },
  accountFarm: { mode, maxAccountsPerDevice: int(1, 1_000), windowMs: int(SECOND, 7 * DAY) },
  journey: { mode, minDwellMs: int(0, 60 * SECOND), tokenTtlMs: int(10 * SECOND, DAY) },
  purchaseQuota: { mode, maxUnitsPerAccount: int(1, 1_000), maxUnitsPerPhone: int(1, 1_000), windowMs: int(SECOND, 30 * DAY) },
};

type Schema = { [key: string]: Schema | Check };

function walk(schema: Schema, value: unknown, path: string, errors: string[], partial: boolean): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push(`${path || 'policy'}: phai la object`);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!(key in schema)) errors.push(`${path}${key}: khoa khong hop le (go nham ten?)`);
  }
  for (const [key, rule] of Object.entries(schema)) {
    if (!(key in obj)) {
      if (!partial) errors.push(`${path}${key}: bat buoc`);
      continue;
    }
    if (typeof rule === 'function') {
      const err = rule(obj[key]);
      if (err) errors.push(`${path}${key}: ${err} (nhan duoc ${JSON.stringify(obj[key])})`);
    } else {
      walk(rule, obj[key], `${path}${key}.`, errors, partial);
    }
  }
}

/** Kiem tra mot ban va (patch) truoc khi gop - chan khoa la de khong "tuong da doi nguong ma thuc ra khong". */
export function validatePatch(patch: unknown): string[] {
  const errors: string[] = [];
  walk(SCHEMA as unknown as Schema, patch, '', errors, true);
  return errors;
}

/** Kiem tra chinh sach day du sau khi gop. */
export function validatePolicy(policy: ShieldPolicy): string[] {
  const errors: string[] = [];
  walk(SCHEMA as unknown as Schema, policy, '', errors, false);
  return errors;
}
