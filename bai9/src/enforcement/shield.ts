import { Inject, Injectable, Logger } from '@nestjs/common';
import { BlockLog, BlockRecord } from '../observability/block-log';
import { ShieldMetrics } from '../observability/shield-metrics';
import { PolicyStore } from '../policy/policy.store';
import { DEFENSE_LAYERS, DefenseLayer, ShieldContext } from './defense-layer';

export type ShieldDecision =
  | { allowed: true; release: () => Promise<void>; policyVersion: number }
  | { allowed: false; block: BlockRecord; retryAfterSec?: number };

/**
 * Bo may thuc thi: cho request di qua cac lop theo thu tu tu RE den DAT (dem -> tap -> chu ky -> han muc).
 *  - Doc chinh sach MOT lan cho ca request -> moi lop dung cung mot phien ban, va doi nguong co hieu luc tu request ke tiep.
 *  - Lop o che do shadow: ghi log "le ra da chan" nhung van cho qua.
 *  - Lop gap loi (vd. kho dem sap): bo qua lop do (fail-open) + ghi loi. Chan oan khach that ton hon de lot 1 bot,
 *    va cac lop con lai van hoat dong doc lap.
 */
@Injectable()
export class Shield {
  private readonly logger = new Logger('Shield');

  constructor(
    @Inject(DEFENSE_LAYERS) private readonly layers: DefenseLayer[],
    private readonly policies: PolicyStore,
    private readonly blockLog: BlockLog,
    private readonly metrics: ShieldMetrics,
  ) {}

  async inspect(ctx: ShieldContext): Promise<ShieldDecision> {
    const { version, policy } = this.policies.current();
    const releases: Array<() => Promise<void>> = [];
    const releaseAll = async () => {
      for (const release of releases.reverse()) {
        await release().catch((e) => this.logger.error(`Hoan han muc that bai req=${ctx.requestId}: ${(e as Error).message}`));
      }
    };

    for (const layer of this.layers) {
      const mode = policy[layer.id].mode;
      if (mode === 'off' || !layer.appliesTo(ctx.action)) continue;

      let verdict;
      try {
        verdict = await layer.evaluate(ctx, policy);
      } catch (e) {
        this.metrics.countError(layer.id);
        this.logger.error(`Lop ${layer.id} loi, bo qua (fail-open) req=${ctx.requestId}: ${(e as Error).message}`);
        continue;
      }
      this.metrics.countEvaluated(layer.id);

      if (!verdict.blocked) {
        if (verdict.release) releases.push(verdict.release);
        continue;
      }

      const shadow = mode === 'shadow';
      const block = this.blockLog.record(ctx, layer, verdict, mode, version);
      this.metrics.countBlocked(layer.id, shadow);
      if (shadow) continue;

      await releaseAll();
      this.metrics.countInspected(false);
      return { allowed: false, block, retryAfterSec: verdict.retryAfterSec };
    }

    this.metrics.countInspected(true);
    return { allowed: true, release: releaseAll, policyVersion: version };
  }
}
