# Product Plan

## Name

TxReceipts

## Positioning

Open-source receipt infrastructure for human-readable, verified Base-first transactions.

## User app

The user app starts Base-first, with experimental multi-network lookup for receipt generation.

Core jobs:

- connect wallet
- see recent network transactions by date
- generate a receipt for any supported transaction
- download PNG receipt
- view monthly summary
- export JSON or CSV later
- ask read-only questions about verified receipt history later

Supported first categories:

- transfer
- swap
- mint
- payment
- subscription
- bridge
- approval
- unknown

## Developer layer

Dapps can integrate with an API or SDK to submit transaction intent metadata.

The platform verifies:

- chain id is Base
- tx exists and succeeded
- sender matches expected user where available
- token transfers match declared input/output
- fees match declared app/protocol fee where observable
- receipt has not already been counted for billing

The first SDK surface is documented in [../packages/sdk](../packages/sdk). Billing is based on one idempotent tx credit per `project_id + chain_id + tx_hash`; detailed rules are in [sdk-billing.md](sdk-billing.md).

Payments start with prepaid native USDC on Base. Organizations can register billing wallets; confirmed USDC transfers from those wallets add credits to the project ledger. See [usdc-payments.md](usdc-payments.md).

## Receipt artifacts

Each receipt should have:

- JSON canonical form
- PNG export
- future PDF export
- TxReceipts signature
- optional daily anchoring proof

## AI assistant layer

Base MCP belongs in a later assistant layer, not in the core verification path. The assistant should answer read-only questions over receipt history, labels, and monthly summaries, then link back to the underlying receipt artifacts and transaction hashes.

See [ai-assistant.md](ai-assistant.md).

## Roadmap

### V0

- static prototype
- schemas
- sample receipt
- security model
- pricing model

### V1

- selected network RPC transaction fetch
- receipt engine
- wallet login
- user dashboard
- PNG export
- rate limits and cache

### V2

- dapp API keys
- intent submission
- verified receipt status
- branded receipts
- webhooks
- developer dashboard
- Ask your Base wallet assistant for read-only receipt questions

### V3

- receipt hash anchoring on Base
- advanced reports
- accounting exports
- optional Base MCP powered assistant actions, gated by explicit user confirmation
- multi-chain support only if it does not weaken Base-first focus
