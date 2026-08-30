#!/usr/bin/env node
/**
 * Trivela Partner Integration Example
 *
 * Demonstrates a partner backend API server integrating Trivela rewards.
 * It provides:
 * 1. A mock purchase endpoint that credits points via the Trivela REST API.
 * 2. A webhook listener that validates signature cryptographic payloads timing-safely.
 */

import http from 'node:http';
import { URL } from 'node:url';
import * as dotenv from 'dotenv';
import { constructEvent } from '../../sdk/webhook-verify/src/index.js';

dotenv.config();

const PORT = process.env.PORT || 4000;
const TRIVELA_API = process.env.TRIVELA_API_URL || 'http://localhost:3001';
const WEBHOOK_SECRET = process.env.TRIVELA_WEBHOOK_SECRET || 'super_secret_signing_key_from_dashboard';

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Trivela-Signature');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 1. Webhook Endpoint
  if (req.method === 'POST' && url.pathname === '/webhook') {
    const body = [];
    req.on('data', (chunk) => {
      body.push(chunk);
    }).on('end', () => {
      const rawPayload = Buffer.concat(body).toString('utf8');
      const signature = req.headers['x-trivela-signature'];

      try {
        // Timing-safely verify signature using webhook-verify SDK
        const event = constructEvent(rawPayload, signature, WEBHOOK_SECRET);
        const sanitizedEventType = event.type.replace(/[\r\n\t]/g, '_');
        console.log(`[Webhook Verified]: Received event type: ${sanitizedEventType}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ verified: true, eventType: event.type }));
      } catch (err) {
        console.error(`[Webhook Verification Failed]: ${err.message}`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }
  
  // 2. Mock User Action Endpoint (Purchase)
  else if (req.method === 'GET' && url.pathname === '/mock-purchase') {
    const campaignId = url.searchParams.get('campaignId') || 'test-campaign';
    const walletAddress = url.searchParams.get('wallet') || 'GBABC321XYZ';

    try {
      console.log(`[Simulation]: Crediting points for campaign ${campaignId} to wallet ${walletAddress}`);
      
      const response = await fetch(`${TRIVELA_API}/api/v1/campaigns/${campaignId}/interact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: walletAddress,
          action: 'partner_purchase',
          value: 15
        })
      });

      if (!response.ok) {
        throw new Error(`Trivela API returned status ${response.status}: ${await response.text()}`);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        message: `Purchase completed. 15 points credited to wallet: ${walletAddress}` 
      }));
    } catch (err) {
      console.error(`[Mock Purchase Failed]: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Not Found
  else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Route Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`Trivela Partner Integration Server running on port ${PORT}`);
  console.log(`- Webhook path: POST http://localhost:${PORT}/webhook`);
  console.log(`- Mock purchase: GET http://localhost:${PORT}/mock-purchase?campaignId=CAMP_ID&wallet=WALLET_ADDR`);
  console.log(`==================================================\n`);
});
