/**
 * Synthetic error injection script to test burn-rate alerts
 * 
 * Injects synthetic errors at different rates to verify fast/medium/slow
 * burn-rate alerts trigger correctly.
 * 
 * Fixes: https://github.com/FinesseStudioLab/Trivela/issues/779
 */

import http from 'http';
import { URL } from 'url';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const ERROR_RATE = parseFloat(process.env.ERROR_RATE || '0.15'); // 15% errors by default
const REQUEST_RATE = parseInt(process.env.REQUEST_RATE || '10'); // 10 req/s
const DURATION_SECONDS = parseInt(process.env.DURATION || '120'); // 2 minutes

console.log(`
🔥 Burn Rate Alert Test
=======================
API Base: ${API_BASE}
Error Rate: ${(ERROR_RATE * 100).toFixed(1)}%
Request Rate: ${REQUEST_RATE} req/s
Duration: ${DURATION_SECONDS}s

Starting in 3 seconds...
`);

await new Promise(resolve => setTimeout(resolve, 3000));

let successCount = 0;
let errorCount = 0;
let totalRequests = 0;

/**
 * Make a request with controlled error injection
 */
async function makeRequest(injectError = false) {
  return new Promise((resolve) => {
    const url = new URL('/api/campaigns', API_BASE);
    const options = {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    };

    if (injectError) {
      // Inject an error by requesting a non-existent resource
      url.pathname = '/api/campaigns/nonexistent-id-to-trigger-error';
    }

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        totalRequests++;
        if (res.statusCode >= 500) {
          errorCount++;
        } else if (res.statusCode >= 200 && res.statusCode < 400) {
          successCount++;
        }
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('error', (err) => {
      totalRequests++;
      errorCount++;
      resolve({ error: err.message });
    });

    req.end();
  });
}

/**
 * Run load test
 */
async function runLoadTest() {
  const startTime = Date.now();
  const endTime = startTime + (DURATION_SECONDS * 1000);
  const intervalMs = 1000 / REQUEST_RATE;

  console.log(`🚀 Load test started at ${new Date().toISOString()}\n`);

  const interval = setInterval(async () => {
    if (Date.now() >= endTime) {
      clearInterval(interval);
      return;
    }

    const shouldError = Math.random() < ERROR_RATE;
    await makeRequest(shouldError);

    // Print progress every 10 requests
    if (totalRequests % 10 === 0) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const actualErrorRate = errorCount / totalRequests;
      const remaining = Math.max(0, DURATION_SECONDS - elapsed);
      
      process.stdout.write(
        `\r[${elapsed}s] Requests: ${totalRequests} | Success: ${successCount} | Errors: ${errorCount} | Error Rate: ${(actualErrorRate * 100).toFixed(1)}% | Remaining: ${remaining}s  `
      );
    }
  }, intervalMs);

  // Wait for test to complete
  await new Promise(resolve => setTimeout(resolve, DURATION_SECONDS * 1000 + 1000));

  console.log(`\n\n✅ Load test completed at ${new Date().toISOString()}`);
  console.log(`
📊 Results:
-----------
Total Requests: ${totalRequests}
Successful: ${successCount} (${((successCount / totalRequests) * 100).toFixed(2)}%)
Errors: ${errorCount} (${((errorCount / totalRequests) * 100).toFixed(2)}%)
Target Error Rate: ${(ERROR_RATE * 100).toFixed(1)}%
Actual Error Rate: ${((errorCount / totalRequests) * 100).toFixed(2)}%

Expected Impact on SLO (99.9% target):
--------------------------------------
Normal error budget allows: 0.1% errors (1 error per 1000 requests)
Current error rate: ${((errorCount / totalRequests) * 100).toFixed(2)}%
Burn rate: ${(((errorCount / totalRequests) * 100) / 0.1).toFixed(1)}x

Alert expectations:
- Fast burn (14.4x): ${((errorCount / totalRequests) * 100) / 0.1 > 14.4 ? '🔴 SHOULD TRIGGER' : '✅ Should NOT trigger'}
- Medium burn (6x): ${((errorCount / totalRequests) * 100) / 0.1 > 6.0 ? '🟡 SHOULD TRIGGER' : '✅ Should NOT trigger'}
- Slow burn (3x): ${((errorCount / totalRequests) * 100) / 0.1 > 3.0 ? '🟠 SHOULD TRIGGER' : '✅ Should NOT trigger'}

Check Prometheus alerts at: ${API_BASE.replace(/:\d+$/, ':9090')}/alerts
Check Grafana dashboard at: ${API_BASE.replace(/:\d+$/, ':3000')}/d/slo-overview
  `);
}

// Run the test
runLoadTest().catch(console.error);
