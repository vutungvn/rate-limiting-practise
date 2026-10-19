import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { dirname } from 'path';
import { BlockVerdict, ShieldContext } from '../enforcement/defense-layer';
import { phoneHash } from '../enforcement/layers/purchase-quota.layer';
import { LayerId, LayerMode } from '../policy/policy.types';

export type Verdict = 'false-positive' | 'confirmed-abuse';

export interface BlockRecord {
  blockId: string;
  at: string;
  requestId: string;
  layer: LayerId;
  layerTitle: string;
  rule: string;
  code: string;
  /** blocked: da chan that. would-block: lop dang o che do shadow, chi ghi nhan. */
  action: 'blocked' | 'would-block';
  mode: LayerMode;
  status: number;
  message: string;
  threshold: unknown;
  observed: unknown;
  policyVersion: number;
  subject: {
    accountId: string;
    deviceId: string;
    ip: string;
    productId: string;
    quantity?: number;
    /** Bam so dien thoai - du de lien ket cac don, khong luu so that vao log. */
    phoneHash?: string;
  };
  request: { method: string; path: string; userAgent: string };
  appeal?: { at: string; message: string };
  review?: { at: string; by: string; verdict: Verdict; note: string };
}

export interface BlockFilter {
  layer?: string;
  code?: string;
  accountId?: string;
  deviceId?: string;
  action?: string;
  limit?: number;
}

const MAX_IN_MEMORY = 10_000;

/**
 * Nhat ky moi lan chan (va "le ra da chan" o che do shadow). Ghi:
 *  - bo nho (truy van nhanh qua /admin/blocks),
 *  - file JSON Lines (SHIELD_LOG_FILE, mac dinh logs/blocks.jsonl) de day sang ELK/Loki,
 *  - 1 dong tom tat ra console.
 * Ghi file loi khong bao gio lam hong request.
 */
@Injectable()
export class BlockLog {
  private readonly logger = new Logger('Shield');
  private readonly file = process.env.SHIELD_LOG_FILE ?? 'logs/blocks.jsonl';
  private records: BlockRecord[] = [];
  private byId = new Map<string, BlockRecord>();
  private fileReady?: Promise<void>;

  record(ctx: ShieldContext, layer: { id: LayerId; title: string }, verdict: BlockVerdict, mode: LayerMode, policyVersion: number): BlockRecord {
    const record: BlockRecord = {
      blockId: `blk_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`,
      at: new Date().toISOString(),
      requestId: ctx.requestId,
      layer: layer.id,
      layerTitle: layer.title,
      rule: verdict.rule,
      code: verdict.code,
      action: mode === 'shadow' ? 'would-block' : 'blocked',
      mode,
      status: verdict.status,
      message: verdict.message,
      threshold: verdict.threshold,
      observed: verdict.observed,
      policyVersion,
      subject: {
        accountId: ctx.accountId,
        deviceId: ctx.deviceId,
        ip: ctx.ip,
        productId: ctx.productId,
        ...(ctx.quantity !== undefined && { quantity: ctx.quantity }),
        ...(ctx.phone && { phoneHash: phoneHash(ctx.phone) }),
      },
      request: { method: ctx.method, path: ctx.path, userAgent: ctx.userAgent },
    };

    this.records.push(record);
    this.byId.set(record.blockId, record);
    if (this.records.length > MAX_IN_MEMORY) this.byId.delete(this.records.shift()!.blockId);

    this.logger.warn(
      `${record.action.toUpperCase()} ${record.blockId} layer=${record.layer} rule=${record.rule} code=${record.code} ` +
        `account=${ctx.accountId} device=${ctx.deviceId} observed=${JSON.stringify(record.observed)} ` +
        `threshold=${JSON.stringify(record.threshold)} policy=v${policyVersion} req=${ctx.requestId}`,
    );
    void this.appendToFile(record);
    return record;
  }

  get(blockId: string): BlockRecord | undefined {
    return this.byId.get(blockId);
  }

  query(filter: BlockFilter = {}): BlockRecord[] {
    const limit = Math.min(Math.max(Number(filter.limit) || 100, 1), 1_000);
    const out: BlockRecord[] = [];
    for (let i = this.records.length - 1; i >= 0 && out.length < limit; i--) {
      const r = this.records[i];
      if (filter.layer && r.layer !== filter.layer) continue;
      if (filter.code && r.code !== filter.code) continue;
      if (filter.accountId && r.subject.accountId !== filter.accountId) continue;
      if (filter.deviceId && r.subject.deviceId !== filter.deviceId) continue;
      if (filter.action && r.action !== filter.action) continue;
      out.push(r);
    }
    return out;
  }

  all(): readonly BlockRecord[] {
    return this.records;
  }

  appeal(blockId: string, message: string): BlockRecord | undefined {
    const r = this.byId.get(blockId);
    if (r) r.appeal = { at: new Date().toISOString(), message };
    return r;
  }

  review(blockId: string, verdict: Verdict, by: string, note: string): BlockRecord | undefined {
    const r = this.byId.get(blockId);
    if (r) r.review = { at: new Date().toISOString(), by, verdict, note };
    return r;
  }

  clear(): void {
    this.records = [];
    this.byId.clear();
  }

  private async appendToFile(record: BlockRecord): Promise<void> {
    if (this.file === 'off') return;
    try {
      this.fileReady ??= fs.mkdir(dirname(this.file), { recursive: true }).then(() => undefined);
      await this.fileReady;
      await fs.appendFile(this.file, JSON.stringify(record) + '\n', 'utf8');
    } catch (e) {
      this.logger.error(`Khong ghi duoc block log ra file ${this.file}: ${(e as Error).message}`);
    }
  }
}
