import { Injectable } from '@nestjs/common';
import { DEFAULT_POLICY } from './default-policy';
import { DeepPartial, ShieldPolicy, VersionedPolicy } from './policy.types';
import { validatePatch, validatePolicy } from './policy.validator';

export class PolicyValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(`Chinh sach khong hop le: ${errors.join('; ')}`);
  }
}

const clone = <T>(v: T): T => structuredClone(v);

function merge<T>(base: T, patch: DeepPartial<T>): T {
  const out = clone(base) as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    out[k] = v !== null && typeof v === 'object' && !Array.isArray(v) ? merge(out[k], v as DeepPartial<unknown>) : v;
  }
  return out as T;
}

/**
 * Chinh sach dang chay, doi duoc luc chay (khong khoi dong lai). Moi lan doi tao phien ban moi;
 * moi quyet dinh chan ghi lai `policyVersion` de truy vet "chan theo nguong nao".
 * Ban va sai -> tu choi ca ban va, chinh sach dang chay giu nguyen.
 */
@Injectable()
export class PolicyStore {
  private versions: VersionedPolicy[] = [];

  constructor() {
    this.reset();
  }

  current(): VersionedPolicy {
    return this.versions[this.versions.length - 1];
  }

  update(patch: unknown, updatedBy: string, reason = ''): VersionedPolicy {
    const patchErrors = validatePatch(patch);
    if (patchErrors.length) throw new PolicyValidationError(patchErrors);

    const next = merge(this.current().policy, patch as DeepPartial<ShieldPolicy>);
    const errors = validatePolicy(next);
    if (errors.length) throw new PolicyValidationError(errors);

    const versioned: VersionedPolicy = {
      version: this.current().version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy,
      reason,
      policy: Object.freeze(next) as ShieldPolicy,
    };
    this.versions.push(versioned);
    return versioned;
  }

  history(): VersionedPolicy[] {
    return [...this.versions];
  }

  reset(): void {
    this.versions = [
      { version: 1, updatedAt: new Date().toISOString(), updatedBy: 'system', reason: 'mac dinh', policy: clone(DEFAULT_POLICY) },
    ];
  }
}
