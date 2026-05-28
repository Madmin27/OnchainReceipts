# Backend Deployment

The lowest-cost production path is:

```txt
Frontend: GitHub Pages
API: Cloudflare Workers
Database: Cloudflare D1
Payment asset: native USDC on Base
Watcher: Cloudflare scheduled trigger
```

This keeps hosting close to free during launch.

## What the API automates

- API key based dapp access.
- Project credit balance lookup.
- Base USDC top-up intent creation.
- Scheduled scan for USDC transfers into the treasury wallet.
- Confirmation of registered billing wallet payments.
- Low-cost AI fallback for accounting questions templates cannot answer.
- Credit ledger top-up.
- Receipt API request usage.
- Duplicate tx hash and duplicate receipt protection.
- First 1,000 API requests free per project.
- After the free allowance, paid request balance is required.

## Deployment steps

1. Create a Cloudflare D1 database.
2. Apply `apps/api/schema.sql`.
3. Copy `apps/api/wrangler.toml.example` to `apps/api/wrangler.toml`.
4. Set:

```txt
TREASURY_ADDRESS = your Base treasury wallet
ALLOWED_ORIGIN = https://txreceipts.com.tr
AI_BASE_URL = https://api.openai.com/v1
AI_MODEL = gpt-4.1-mini
```

5. Add the D1 database id in `wrangler.toml`.
6. Deploy the Worker.
7. Point `api.txreceipts.com.tr` to the Worker route.

## First project creation

Set an admin secret:

```sh
wrangler secret put ADMIN_TOKEN
wrangler secret put AI_API_KEY
```

`AI_API_KEY` is the OpenAI API key and must be stored as a Cloudflare Worker secret. Do not put it in `wrangler.toml`.

Create a project and first billing wallet:

```sh
curl -X POST https://api.txreceipts.com.tr/v1/admin/projects \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo Project","billingWallet":"0x...","billingWalletLabel":"Treasury"}'
```

The API returns the plaintext API key once. Store it securely. D1 stores only the SHA-256 hash.

## USDC top-up flow

1. Dapp calls `POST /v1/credits/topups`.
2. API returns amount, receiving address, Base USDC contract, and expiry.
3. Dapp sends native Base USDC from its registered billing wallet.
4. Scheduled Worker scans Base token transfers for the treasury wallet.
5. If token, sender, recipient, amount, tx hash, and confirmations pass, credits are added.

## Receipt usage flow

1. Dapp calls `POST /v1/receipts`.
2. API checks idempotency by `project_id + chain_id + tx_hash`.
3. If duplicate, no extra credit is counted.
4. If the project still has free monthly allowance remaining, the request is accepted without spending paid balance.
5. After the first 1,000 API requests, each new request deducts one paid request unit.
6. A 5 USDC top-up adds 10,000 paid API requests.
7. If no free allowance and no paid request balance remain, API returns `402`.

## Security checks

- No private keys or wallet approvals.
- API keys stored as hashes.
- CORS restricted to the public site.
- Native Base USDC contract is hardcoded.
- Wrong network/token/recipient/sender is rejected.
- Duplicate tx hashes cannot be credited twice.
- High-value top-ups over 10,000 USDC require manual review.
- Credit balance is ledger-derived.
