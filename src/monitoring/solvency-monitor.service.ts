import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Gauge, Registry } from 'prom-client';

export interface SolvencySnapshot {
  reserveXlm: number;
  liabilitiesXlm: number;
  solvencyRatio: number;
  contractTtlLedgers: number;
  lastCheckedAt: Date;
}

/**
 * SolvencyMonitorService — issue #874
 *
 * Polls on-chain reserve vs. outstanding redeemable liabilities every
 * POLL_INTERVAL_MS and exports the results as Prometheus Gauges so
 * Grafana dashboards and alert rules can act on them.
 *
 * Metrics exported:
 *   trivela_contract_reserve_xlm        — current XLM held in escrow
 *   trivela_contract_liabilities_xlm    — outstanding redeemable points in XLM
 *   trivela_solvency_ratio              — reserve / liabilities (< 1 = shortfall)
 *   trivela_contract_ttl_ledgers        — ledgers until contract archival
 */
@Injectable()
export class SolvencyMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SolvencyMonitorService.name);
  private timer: NodeJS.Timeout | null = null;

  private static readonly POLL_INTERVAL_MS = 60_000; // 1 minute
  private static readonly TTL_WARNING_LEDGERS = 50_000;

  // ── Prometheus Gauges ───────────────────────────────────────────────────────

  public readonly reserveXlm: Gauge;
  public readonly liabilitiesXlm: Gauge;
  public readonly solvencyRatio: Gauge;
  public readonly contractTtlLedgers: Gauge;

  constructor(registry: Registry) {
    this.reserveXlm = new Gauge({
      name: 'trivela_contract_reserve_xlm',
      help: 'XLM held in the Trivela escrow contract (on-chain reserves)',
      registers: [registry],
    });

    this.liabilitiesXlm = new Gauge({
      name: 'trivela_contract_liabilities_xlm',
      help: 'Outstanding redeemable points expressed in XLM (liabilities)',
      registers: [registry],
    });

    this.solvencyRatio = new Gauge({
      name: 'trivela_solvency_ratio',
      help: 'reserve / liabilities ratio; values below 1.0 indicate a shortfall',
      registers: [registry],
    });

    this.contractTtlLedgers = new Gauge({
      name: 'trivela_contract_ttl_ledgers',
      help: 'Ledgers remaining before contract instance storage expires (TTL headroom)',
    registers: [registry],
    });
  }

  onModuleInit() {
    this.poll(); // immediate first sample
    this.timer = setInterval(
      () => this.poll(),
      SolvencyMonitorService.POLL_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ── Polling ─────────────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    try {
      const snapshot = await this.fetchSnapshot();
      this.reserveXlm.set(snapshot.reserveXlm);
      this.liabilitiesXlm.set(snapshot.liabilitiesXlm);
      this.solvencyRatio.set(snapshot.solvencyRatio);
      this.contractTtlLedgers.set(snapshot.contractTtlLedgers);

      if (snapshot.solvencyRatio < 1) {
        this.logger.warn(
          `SOLVENCY SHORTFALL: ratio=${snapshot.solvencyRatio.toFixed(4)} ` +
            `reserve=${snapshot.reserveXlm} liabilities=${snapshot.liabilitiesXlm}`,
        );
      }

      if (snapshot.contractTtlLedgers < SolvencyMonitorService.TTL_WARNING_LEDGERS) {
        this.logger.warn(
          `CONTRACT TTL LOW: ${snapshot.contractTtlLedgers} ledgers remaining`,
        );
      }
    } catch (err) {
      this.logger.error('Solvency poll failed', err);
    }
  }

  /**
   * Fetch reserve, liabilities, and TTL from the Soroban RPC.
   *
   * Replace the stub below with real Soroban contract reads against
   * the reward / escrow contract once the ABI is finalised. The metric
   * names and alert thresholds are stable regardless of the RPC shape.
   */
  private async fetchSnapshot(): Promise<SolvencySnapshot> {
    // TODO: replace with real Soroban RPC calls:
    //   const rpc = new StellarSdk.SorobanRpc.Server(process.env.SOROBAN_RPC_URL);
    //   const result = await rpc.getContractData(CONTRACT_ID, xdr.ScVal.scvLedgerKeyContractInstance());
    //   parse reserve, liabilities, TTL from result.val and result.expirationLedgerSeq

    const reserveXlm = 0;
    const liabilitiesXlm = 0;
    const contractTtlLedgers = 0;
    const solvencyRatio = liabilitiesXlm > 0 ? reserveXlm / liabilitiesXlm : 1;

    return {
      reserveXlm,
      liabilitiesXlm,
      solvencyRatio,
      contractTtlLedgers,
      lastCheckedAt: new Date(),
    };
  }

  /** Return the most-recently-computed snapshot for health endpoints. */
  async getSnapshot(): Promise<SolvencySnapshot> {
    return this.fetchSnapshot();
  }
}
