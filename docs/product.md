# Product Plan

## Name

OnchainReceipts

## Positioning

Open-source receipt infrastructure for human-readable, verified Base transactions.

## User app

The user app starts with Base mainnet only.

Core jobs:

- connect wallet
- see recent Base transactions by date
- generate a receipt for any supported transaction
- download SVG/PNG receipt
- view monthly summary
- export JSON or CSV later

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

## Receipt artifacts

Each receipt should have:

- JSON canonical form
- SVG renderer
- PNG export
- future PDF export
- OnchainReceipts signature
- optional daily anchoring proof

## Roadmap

### V0

- static prototype
- schemas
- sample receipt
- security model
- pricing model

### V1

- Base RPC transaction fetch
- receipt engine
- wallet login
- user dashboard
- SVG/PNG export
- rate limits and cache

### V2

- dapp API keys
- intent submission
- verified receipt status
- branded receipts
- webhooks
- developer dashboard

### V3

- receipt hash anchoring on Base
- advanced reports
- accounting exports
- multi-chain support only if it does not weaken Base-first focus
