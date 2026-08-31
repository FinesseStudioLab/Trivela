import { Injectable, OnModuleInit } from '@nestjs/common';
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

@Injectable()
export class PrometheusMetricsService implements OnModuleInit {
  private readonly registry: Registry;
  
  // HTTP metrics
  public readonly httpRequestsTotal: Counter;
  public readonly httpRequestDuration: Histogram;
  
  // Stellar/Soroban metrics
  public readonly sorobanRequestsTotal: Counter;
  public readonly sorobanRequestDuration: Histogram;
  public readonly sorobanFailures: Counter;
  
  // Business metrics
  public readonly bountiesCreated: Counter;
  public readonly bountiesClaimed: Counter;
  public readonly paymentsProcessed: Counter;
  public readonly escrowFunded: Counter;
  
  // System metrics
  public readonly activeConnections: Gauge;
  public readonly queueSize: Gauge;

  constructor() {
    this.registry = new Registry();
    
    // HTTP Metrics
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    // Soroban Metrics
    this.sorobanRequestsTotal = new Counter({
      name: 'soroban_requests_total',
      help: 'Total Soroban RPC requests',
      labelNames: ['method', 'status'],
      registers: [this.registry],
    });

    this.sorobanRequestDuration = new Histogram({
      name: 'soroban_request_duration_seconds',
      help: 'Soroban RPC request duration',
      labelNames: ['method'],
      buckets: [0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });

    this.sorobanFailures = new Counter({
      name: 'soroban_failures_total',
      help: 'Total Soroban RPC failures',
      labelNames: ['error_type'],
      registers: [this.registry],
    });

    // Business Metrics
    this.bountiesCreated = new Counter({
      name: 'bounties_created_total',
      help: 'Total bounties created',
      registers: [this.registry],
    });

    this.bountiesClaimed = new Counter({
      name: 'bounties_claimed_total',
      help: 'Total bounties claimed',
      registers: [this.registry],
    });

    this.paymentsProcessed = new Counter({
      name: 'payments_processed_total',
      help: 'Total payments processed',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.escrowFunded = new Counter({
      name: 'escrow_funded_total',
      help: 'Total escrow funding operations',
      registers: [this.registry],
    });

    // System Metrics
    this.activeConnections = new Gauge({
      name: 'active_connections',
      help: 'Number of active connections',
      registers: [this.registry],
    });

    this.queueSize = new Gauge({
      name: 'queue_size',
      help: 'Current queue size',
      labelNames: ['queue_name'],
      registers: [this.registry],
    });
  }

  async onModuleInit() {
    // Register default metrics (CPU, memory, etc.)
    const defaultMetrics = await import('prom-client');
    defaultMetrics.collectDefaultMetrics({ register: this.registry });
  }

  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getRegistry(): Registry {
    return this.registry;
  }
}
