# OnchainReceipts

Open-source receipt infrastructure for human-readable, verified Base transactions.

OnchainReceipts turns complex onchain activity into receipts people can read, download, reconcile, and trust. The long-term goal is not just to decode a transaction hash. It is to compare what a dapp said it was doing with what actually happened onchain, then produce a signed receipt that works for users, builders, and accountants.

## Why this exists

Block explorers are precise, but most people cannot read raw logs, internal calls, router paths, gas accounting, and token transfers with confidence. Wallet previews help before signing, but after the transaction users still need a clear record of what happened.

OnchainReceipts is designed for:

- Users who want a monthly receipt box for Base activity.
- Dapps that want to give users verified receipts after swaps, mints, payments, subscriptions, games, and creator support.
- Builders who need a shared schema for transaction intent, actual onchain outcome, fee breakdowns, and downloadable receipt artifacts.

## What makes it different

There are already products that make transaction hashes more readable. OnchainReceipts focuses on a different primitive:

**Intent plus verification.**

A dapp can send intent metadata after a transaction:

- what the user intended to do
- expected input and output assets
- app fee, protocol fee, merchant, category, and receipt copy
- app identity and branding

The receipt engine then checks Base onchain data:

- transaction success
- sender and recipient relationships
- ERC-20 transfers
- gas paid
- observed fees
- whether the actual result matches the submitted intent

The output is a signed receipt JSON plus SVG/PNG/PDF render targets.

## Launch scope

V1 is intentionally narrow:

- Base mainnet only
- wallet-connected user receipt inbox
- transaction timeline
- receipt generation from transaction hash
- SVG/PNG receipt export
- monthly summary
- open receipt schema
- dapp intent schema and SDK draft

V2 adds:

- developer API keys
- verified dapp receipts
- webhooks
- branded receipts
- CSV exports
- optional daily receipt hash anchoring on Base

## Repository map

```txt
apps/web/          Static product prototype and receipt renderer
docs/              Research, product design, security, pricing
schema/            Receipt and dapp intent JSON schemas
examples/          Sample receipt payloads
packages/engine/   Planned parser and verification engine
packages/sdk/      Planned dapp SDK
```

## Current prototype

Open `apps/web/index.html` in a browser. The first prototype is dependency-free so the project can be reviewed without a build step.

## Security posture

OnchainReceipts should never ask for private keys, seed phrases, token approvals, or spending permissions. Wallet signatures are only for login/session ownership. Receipt generation reads public Base data and optionally accepts signed dapp intent metadata.

See [docs/security-model.md](docs/security-model.md).

## License

MIT. See [LICENSE](LICENSE).
