# SDK, Payments, and Tx Credits

TxReceipts should make dapp integration simple while keeping billing predictable and hard to abuse.

## Integration model

Dapps integrate after a transaction is submitted and confirmed.

1. The dapp sends transaction intent metadata with `txHash`, `chainId`, user wallet, expected assets, fee disclosures, and a merchant/reference id.
2. TxReceipts fetches onchain data from trusted RPC/indexer sources.
3. The receipt engine compares declared intent with observed outcome.
4. The API returns a receipt id, verification status, artifact URLs, and credit accounting result.

The SDK must never request private keys, approvals, token permissions, or spending access.

## Credit unit

One tx credit equals one successful verified receipt for:

```txt
project_id + chain_id + tx_hash
```

This idempotency key prevents duplicate billing when a dapp retries the same request.

## Credit states

```txt
reserved
verified
partial
mismatch
failed
refunded
```

- `reserved`: request accepted and being processed.
- `verified`: observed onchain outcome matches the submitted intent.
- `partial`: transaction is valid, but some metadata could not be fully checked.
- `mismatch`: transaction exists, but submitted intent does not match observed outcome.
- `failed`: transaction lookup or parsing failed.
- `refunded`: a reserved credit was released because the platform could not process the receipt.

## Counting rules

Count a credit when:

- a new `project_id + chain_id + tx_hash` reaches `verified`;
- a branded receipt is created from a verified receipt;
- an anchored proof is created on a paid plan.

Do not count a credit when:

- the same project regenerates an existing receipt;
- the same user downloads PNG/JSON/PDF again;
- parsing fails before verification;
- a user manually generates a receipt from the public app;
- the dapp sends invalid metadata rejected before processing.

`partial` and `mismatch` should appear in the developer dashboard, but they should not count during the first launch period. Later, paid plans can count `partial` if it still produces an official artifact.

## Launch pricing

```txt
Free
- 250 verified dapp receipts / month
- TxReceipts watermark
- community support

Starter - $9 / month
- 5,000 verified dapp receipts / month
- basic branding
- API key
- dashboard
- overage: $0.001 / verified receipt

Builder - $29 / month
- 25,000 verified dapp receipts / month
- custom logo
- webhook delivery
- CSV export
- overage: $0.0008 / verified receipt

Growth - $79 / month
- 100,000 verified dapp receipts / month
- priority processing
- advanced analytics
- optional daily receipt hash anchoring
- overage: $0.0005 / verified receipt
```

Individual wallet usage stays free at launch with wallet, IP, and monthly quota limits.

## Payment flow

For launch, use hosted billing instead of building payment custody.

Recommended first implementation:

- prepaid Base USDC top-ups for dapp credits;
- Stripe Checkout later only if non-crypto teams ask for card billing;
- optional Coinbase Commerce later if direct invoicing becomes useful;
- backend stores `project_id`, plan, monthly included credits, used credits, and billing period.

The frontend should not contain payment secrets. API keys and billing webhooks must live in the backend.

See [usdc-payments.md](usdc-payments.md) for the Base USDC payment and credit top-up model.

## Ledger model

Each project needs an append-only credit ledger.

```txt
credit_ledger
- id
- project_id
- chain_id
- tx_hash
- receipt_id
- idempotency_key
- status
- counted_credits
- reason
- created_at
- finalized_at
```

Monthly usage is derived from ledger rows, not mutable counters. Cached counters are allowed for speed, but invoices should be based on ledger reconciliation.

## API surface

```txt
POST /v1/receipts
GET  /v1/receipts/:id
GET  /v1/projects/:id/usage
POST /v1/credits/topups
GET  /v1/credits/topups/:id
POST /v1/webhooks/test
```

`POST /v1/receipts` accepts an idempotency key. The SDK should generate one from:

```txt
project_id:chain_id:tx_hash
```

## Abuse controls

- API key per project.
- Idempotency by project, chain, and tx hash.
- Per-minute API key rate limits.
- Per-wallet public app limits.
- Do not count duplicate downloads.
- Reject metadata fields above strict size limits.
- Render artifacts through safe canvas/PDF generation, never arbitrary HTML.
- Keep webhooks signed and retry with exponential backoff.

## What dapps see

The SDK response should always include:

- `receiptId`
- `status`
- `credit.counted`
- `credit.reason`
- `artifacts.pngUrl`
- `artifacts.jsonUrl`
- `verification.checks`

This makes billing explainable. A dapp should be able to answer: "Did this request cost one credit, and why?"
