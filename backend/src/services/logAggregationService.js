/**
 * Log aggregation service for Loki integration.
 * Configures and manages centralized log collection via Loki and Promtail.
 */

export function createLogAggregationService({
  lokiEndpoint = process.env.LOKI_ENDPOINT || 'http://localhost:3100',
  serviceName = process.env.OTEL_SERVICE_NAME || 'trivela-backend',
  environment = process.env.NODE_ENV || 'development',
  logger,
} = {}) {
  return {
    /**
     * Send a structured log entry to Loki
     */
    async sendLog(logEntry) {
      try {
        if (!lokiEndpoint) {
          logger?.warn?.('Loki endpoint not configured, skipping log aggregation');
          return;
        }

        const payload = {
          streams: [
            {
              stream: {
                service: serviceName,
                environment,
                level: logEntry.level || 'info',
                ...logEntry.labels,
              },
              values: [
                [
                  Date.now() * 1000000, // Nanoseconds for Loki
                  JSON.stringify({
                    message: logEntry.message,
                    ...logEntry.fields,
                  }),
                ],
              ],
            },
          ],
        };

        const response = await fetch(`${lokiEndpoint}/loki/api/v1/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          logger?.error?.(`Loki push failed: ${response.statusText}`);
        }
      } catch (err) {
        logger?.error?.({ err: err.message }, 'Failed to send log to Loki');
      }
    },

    /**
     * Query logs from Loki
     */
    async queryLogs(query, limit = 100) {
      try {
        if (!lokiEndpoint) {
          return [];
        }

        const params = new URLSearchParams({
          query,
          limit,
        });

        const response = await fetch(`${lokiEndpoint}/loki/api/v1/query_range?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Loki query failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.data?.result || [];
      } catch (err) {
        logger?.error?.({ err: err.message }, 'Failed to query Loki');
        return [];
      }
    },

    /**
     * Get aggregation stats from Loki
     */
    async getStats(service = serviceName, range = '24h') {
      try {
        if (!lokiEndpoint) {
          return null;
        }

        const query = `sum(count_over_time({service="${service}"}[${range}]))`;
        const response = await fetch(
          `${lokiEndpoint}/loki/api/v1/query?query=${encodeURIComponent(query)}`,
        );

        if (!response.ok) {
          return null;
        }

        const data = await response.json();
        return data.data?.result?.[0];
      } catch (err) {
        logger?.error?.({ err: err.message }, 'Failed to get Loki stats');
        return null;
      }
    },

    /**
     * Health check for Loki connectivity
     */
    async healthCheck() {
      try {
        if (!lokiEndpoint) {
          return { healthy: false, reason: 'Loki endpoint not configured' };
        }

        const response = await fetch(`${lokiEndpoint}/ready`);
        return {
          healthy: response.ok,
          reason: response.ok ? 'Loki is ready' : `Loki returned ${response.status}`,
        };
      } catch (err) {
        return { healthy: false, reason: err.message };
      }
    },
  };
}

/**
 * Middleware to automatically log requests to Loki
 */
export function createLogAggregationMiddleware(logAggregationService) {
  return function logAggregation(req, res, next) {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;

      // Fire-and-forget log to Loki
      logAggregationService.sendLog({
        level: res.statusCode >= 400 ? 'error' : 'info',
        message: `${req.method} ${req.path}`,
        labels: {
          method: req.method,
          path: req.path,
          status: res.statusCode,
        },
        fields: {
          duration_ms: duration,
          status: res.statusCode,
          method: req.method,
          path: req.path,
          remote_addr: req.ip,
        },
      }).catch(() => {
        // Silent fail for log aggregation errors
      });
    });

    next();
  };
}
