# Staging Deployment Guide

This guide provides instructions for setting up a staging environment for Trivela.

## Recommended Hosting

### Backend (Node.js API)
- **Render**: Excellent for Node.js apps with integrated SQLite/PostgreSQL support.
- **Railway**: Fast setup and easy environment variable management.
- **Fly.io**: Good for low-latency global deployments.

**Deployment Steps (Render example):**
1. Create a new "Web Service".
2. Connect your Trivela repository.
3. Set the root directory to `backend`.
4. Build Command: `npm install`
5. Start Command: `node src/index.js`

### Frontend (React/Vite)
- **Vercel**: The industry standard for Vite/React apps.
- **Netlify**: Great automation and preview deployments.
- **Cloudflare Pages**: Extremely fast global edge delivery.

**Deployment Steps (Vercel example):**
1. Create a new project and connect your repository.
2. Set the root directory to `frontend`.
3. Framework Preset: `Vite`.
4. Build Command: `npm run build`.
5. Output Directory: `dist`.

## Environment Variables

### Backend Configuration
| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Listening port | `3001` |
| `DATABASE_URL` | SQLite path or DB connection string | `trivela.sqlite` |
| `TRIVELA_API_KEY` | Admin API Key for protected routes | your-secure-key |
| `STELLAR_NETWORK` | `testnet` or `production` | `testnet` |
| `SOROBAN_RPC_URL` | RPC endpoint | `https://soroban-testnet.stellar.org` |
| `HORIZON_URL` | Horizon endpoint | `https://horizon-testnet.stellar.org` |
| `REWARDS_CONTRACT_ID` | Deployed Rewards Contract ID | `C...` |
| `CAMPAIGN_CONTRACT_ID` | Deployed Campaign Contract ID | `C...` |

### Frontend Configuration
| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend URL | `https://api-staging.trivela.com` |
| `VITE_STELLAR_NETWORK` | `testnet` or `production` | `testnet` |

## Rollback Guidance

### Frontend
- Most providers (Vercel, Netlify) support one-click rollbacks to previous deployments in their dashboard.

### Backend
- Ensure you take periodic backups of your SQLite database if using local storage.
- When rolling back, be mindful of any schema changes that may have occurred if you used migrations (though current DAL uses a simple schema).
- If using a cloud provider like Render, you can redeploy a specific commit from the dashboard.

## Verification
1. After deployment, check the `/health` endpoint on your backend.
2. Verify the frontend can reach the backend by checking the "Live campaigns" list.
3. Ensure the "Wallet rewards" section correctly identifies the network.
