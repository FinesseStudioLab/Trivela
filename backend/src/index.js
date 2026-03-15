/**
 * Trivela Backend API
 * Serves campaign data, health, and Stellar/Soroban RPC proxy for the frontend.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Health check for Drip and reviewers
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'trivela-api', timestamp: new Date().toISOString() });
});

// API info
app.get('/api', (_req, res) => {
  res.json({
    name: 'Trivela API',
    version: '0.1.0',
    endpoints: {
      health: 'GET /health',
      campaigns: 'GET /api/campaigns',
      campaign: 'GET /api/campaigns/:id',
    },
    stellar: {
      network: process.env.STELLAR_NETWORK || 'testnet',
      rpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
    },
  });
});

// Placeholder campaigns (replace with DB later)
const campaigns = [
  {
    id: '1',
    name: 'Welcome Campaign',
    description: 'Earn points for completing onboarding',
    active: true,
    rewardPerAction: 10,
    createdAt: new Date().toISOString(),
  },
];

app.get('/api/campaigns', (_req, res) => {
  res.json(campaigns);
});

app.get('/api/campaigns/:id', (req, res) => {
  const campaign = campaigns.find((c) => c.id === req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  res.json(campaign);
});

app.listen(PORT, () => {
  console.log(`Trivela API running at http://localhost:${PORT}`);
});
