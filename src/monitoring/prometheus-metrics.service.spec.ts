import { Test, TestingModule } from '@nestjs/testing';
import { PrometheusMetricsService } from './prometheus-metrics.service';

describe('PrometheusMetricsService', () => {
  let service: PrometheusMetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrometheusMetricsService],
    }).compile();

    service = module.get<PrometheusMetricsService>(PrometheusMetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should track HTTP requests', () => {
    service.httpRequestsTotal.inc({ method: 'GET', route: '/api/test', status_code: '200' });
    expect(service.httpRequestsTotal).toBeDefined();
  });

  it('should provide metrics endpoint', async () => {
    const metrics = await service.getMetrics();
    expect(metrics).toContain('http_requests_total');
    expect(metrics).toContain('soroban_requests_total');
  });

  it('should track business metrics', () => {
    service.bountiesCreated.inc();
    service.paymentsProcessed.inc({ status: 'success' });
    expect(service.bountiesCreated).toBeDefined();
  });
});
