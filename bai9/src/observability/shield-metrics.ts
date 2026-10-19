import { Injectable } from '@nestjs/common';
import { LAYER_IDS, LayerId } from '../policy/policy.types';
import { PolicyStore } from '../policy/policy.store';
import { BlockLog } from './block-log';

interface LayerCounters {
  evaluated: number;
  blocked: number;
  wouldBlock: number;
  errors: number;
}

const ratio = (num: number, den: number) => (den === 0 ? null : Math.round((num / den) * 10_000) / 100);

/**
 * Dem so lan danh gia / chan / loi cua tung lop, va bao cao TI LE CHAN NHAM tu ba nguon:
 *  1. Ket luan cua doi van hanh tren tung lan chan (review: false-positive | confirmed-abuse),
 *  2. Khieu nai cua khach (appeal) - nghi chan nham, cho xem xet,
 *  3. Che do shadow - so lan "le ra da chan" truoc khi bat that.
 */
@Injectable()
export class ShieldMetrics {
  private counters = new Map<LayerId, LayerCounters>();
  private inspected = 0;
  private allowed = 0;

  constructor(
    private readonly blockLog: BlockLog,
    private readonly policies: PolicyStore,
  ) {
    this.clear();
  }

  countInspected(allowed: boolean) {
    this.inspected++;
    if (allowed) this.allowed++;
  }

  countEvaluated(layer: LayerId) {
    this.counters.get(layer)!.evaluated++;
  }

  countBlocked(layer: LayerId, shadow: boolean) {
    const c = this.counters.get(layer)!;
    if (shadow) c.wouldBlock++;
    else c.blocked++;
  }

  countError(layer: LayerId) {
    this.counters.get(layer)!.errors++;
  }

  report() {
    const policy = this.policies.current();
    const records = this.blockLog.all();
    const layers = LAYER_IDS.map((layer) => {
      const c = this.counters.get(layer)!;
      const mine = records.filter((r) => r.layer === layer && r.action === 'blocked');
      const falsePositive = mine.filter((r) => r.review?.verdict === 'false-positive').length;
      const confirmedAbuse = mine.filter((r) => r.review?.verdict === 'confirmed-abuse').length;
      return {
        layer,
        mode: policy.policy[layer].mode,
        ...c,
        reviewed: { falsePositive, confirmedAbuse, unreviewed: mine.length - falsePositive - confirmedAbuse },
        appealsPending: mine.filter((r) => r.appeal && !r.review).length,
        /** Ti le chan nham tren cac lan chan DA duoc xem xet (%). null = chua co du lieu. */
        falsePositiveRatePct: ratio(falsePositive, falsePositive + confirmedAbuse),
      };
    });

    const reviewedFp = layers.reduce((s, l) => s + l.reviewed.falsePositive, 0);
    const reviewedTp = layers.reduce((s, l) => s + l.reviewed.confirmedAbuse, 0);
    return {
      generatedAt: new Date().toISOString(),
      policyVersion: policy.version,
      totals: {
        inspected: this.inspected,
        allowed: this.allowed,
        blocked: this.inspected - this.allowed,
        wouldBlockInShadow: layers.reduce((s, l) => s + l.wouldBlock, 0),
        layerErrors: layers.reduce((s, l) => s + l.errors, 0),
      },
      falsePositive: {
        reviewedBlocks: reviewedFp + reviewedTp,
        falsePositive: reviewedFp,
        confirmedAbuse: reviewedTp,
        falsePositiveRatePct: ratio(reviewedFp, reviewedFp + reviewedTp),
        appealsPending: layers.reduce((s, l) => s + l.appealsPending, 0),
        unreviewedBlocks: layers.reduce((s, l) => s + l.reviewed.unreviewed, 0),
      },
      layers,
    };
  }

  clear(): void {
    this.inspected = 0;
    this.allowed = 0;
    for (const id of LAYER_IDS) this.counters.set(id, { evaluated: 0, blocked: 0, wouldBlock: 0, errors: 0 });
  }
}
