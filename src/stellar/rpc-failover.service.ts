import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { rpc } from '@stellar/stellar-sdk';

export interface RPCProvider {
  url: string;
  server: rpc.Server;
  healthy: boolean;
  failureCount: number;
  lastCheck: Date;
}

@Injectable()
export class RPCFailoverService {
  private readonly logger = new Logger(RPCFailoverService.name);
  private readonly providers: RPCProvider[] = [];
  private currentProviderIndex = 0;
  private readonly maxFailures = 3;
  private readonly healthCheckInterval = 60000; // 1 minute

  constructor(private readonly configService: ConfigService) {
    this.initializeProviders();
    this.startHealthChecks();
  }

  /**
   * Initialize RPC providers from config
   */
  private initializeProviders(): void {
    const primaryUrl = this.configService.get('stellar.sorobanRpcUrl');
    const fallbackUrls = this.configService.get<string[]>(
      'stellar.fallbackRpcUrls',
      [],
    );

    const urls = [primaryUrl, ...fallbackUrls].filter(Boolean);

    for (const url of urls) {
      this.providers.push({
        url,
        server: new rpc.Server(url, {
          allowHttp: url.startsWith('http://'),
        }),
        healthy: true,
        failureCount: 0,
        lastCheck: new Date(),
      });
    }

    this.logger.log(`Initialized ${this.providers.length} RPC providers`);
  }

  /**
   * Get current healthy provider
   */
  private getCurrentProvider(): RPCProvider {
    // Find first healthy provider
    for (let i = 0; i < this.providers.length; i++) {
      const index = (this.currentProviderIndex + i) % this.providers.length;
      const provider = this.providers[index];
      
      if (provider.healthy) {
        this.currentProviderIndex = index;
        return provider;
      }
    }

    // If no healthy providers, use primary anyway (will fail)
    this.logger.error('No healthy RPC providers available');
    return this.providers[0];
  }

  /**
   * Execute RPC call with automatic failover
   */
  async executeWithFailover<T>(
    operation: (server: rpc.Server) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = this.providers.length;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const provider = this.getCurrentProvider();

      try {
        const result = await operation(provider.server);
        
        // Success - reset failure count
        if (provider.failureCount > 0) {
          provider.failureCount = 0;
          this.logger.log(`Provider ${provider.url} recovered`);
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        this.handleProviderFailure(provider, error as Error);

        // Try next provider
        this.currentProviderIndex =
          (this.currentProviderIndex + 1) % this.providers.length;
      }
    }

    throw new Error(
      `All RPC providers failed. Last error: ${lastError?.message}`,
    );
  }

  /**
   * Handle provider failure
   */
  private handleProviderFailure(provider: RPCProvider, error: Error): void {
    provider.failureCount++;
    
    this.logger.warn(
      `Provider ${provider.url} failed (${provider.failureCount}/${this.maxFailures}): ${error.message}`,
    );

    if (provider.failureCount >= this.maxFailures) {
      provider.healthy = false;
      this.logger.error(
        `Provider ${provider.url} marked as unhealthy after ${this.maxFailures} failures`,
      );
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    setInterval(async () => {
      for (const provider of this.providers) {
        if (!provider.healthy || provider.failureCount > 0) {
          await this.checkProviderHealth(provider);
        }
      }
    }, this.healthCheckInterval);
  }

  /**
   * Check individual provider health
   */
  private async checkProviderHealth(provider: RPCProvider): Promise<void> {
    try {
      await provider.server.getLatestLedger();
      
      if (!provider.healthy) {
        provider.healthy = true;
        provider.failureCount = 0;
        this.logger.log(`Provider ${provider.url} is now healthy`);
      }
      
      provider.lastCheck = new Date();
    } catch (error) {
      this.logger.debug(
        `Health check failed for ${provider.url}: ${error.message}`,
      );
    }
  }

  /**
   * Get provider status
   */
  getProviderStatus(): Array<{
    url: string;
    healthy: boolean;
    failureCount: number;
    lastCheck: Date;
  }> {
    return this.providers.map((p) => ({
      url: p.url,
      healthy: p.healthy,
      failureCount: p.failureCount,
      lastCheck: p.lastCheck,
    }));
  }
}
