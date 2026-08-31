# Trivela Example: Partner Integration

Demonstrates how to embed Trivela rewards into a third-party application backend and frontend.

## What it shows

- Simulating a user purchase and calling Trivela `POST /api/campaigns/:id/interact` to credit
  points.
- Setting up a webhook handler to receive cryptographically signed updates from Trivela.
- Verifying the signature (`X-Trivela-Signature` header) timing-safely using
  `@trivela/webhook-verify`.

## Prerequisites

- Node.js 18+
- Trivela backend running locally (`compose up` from repo root)

## Setup

1. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
2. Fill in `TRIVELA_API_URL` and `TRIVELA_WEBHOOK_SECRET` in `.env`.

## Run

Run the integration server:

```bash
node index.js
```

The server will start on port `4000`. You can trigger a mock user action by visiting
`http://localhost:4000/mock-purchase`, and you can test webhook verification by sending POST
requests to `http://localhost:4000/webhook`.
