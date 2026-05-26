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
- Credit ledger top-up.
- Receipt credit usage.
- Duplicate tx hash and duplicate receipt protection.
- -10 credit overdraft tolerance for live dapps.

## Deployment steps

1. Create a Cloudflare D1 database.
2. Apply `apps/api/schema.sql`.
3. Copy `apps/api/wrangler.toml.example` to `apps/api/wrangler.toml`.
4. Set:

```txt
TREASURY_ADDRESS = your Base treasury wallet
ALLOWED_ORIGIN = https://txreceipts.com.tr
```

5. Add the D1 database id in `wrangler.toml`.
6. Deploy the Worker.
7. Point `api.txreceipts.com.tr` to the Worker route.

## First project creation

Set an admin secret:

```sh
wrangler secret put ADMIN_TOKEN
```

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
4. If new, one credit is deducted.
5. The request is allowed while balance remains at or above `-10`.
6. Below `-10`, API returns `402`.

## Security checks

- No private keys or wallet approvals.
- API keys stored as hashes.
- CORS restricted to the public site.
- Native Base USDC contract is hardcoded.
- Wrong network/token/recipient/sender is rejected.
- Duplicate tx hashes cannot be credited twice.
- High-value top-ups over 10,000 USDC require manual review.
- Credit balance is ledger-derived.
