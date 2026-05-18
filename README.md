# TxReceipts

Open-source receipt infrastructure for human-readable, verified Base transactions.

TxReceipts turns complex onchain activity into receipts people can read, download, reconcile, and trust. The long-term goal is not just to decode a transaction hash. It is to compare what a dapp said it was doing with what actually happened onchain, then produce a signed receipt that works for users, builders, and accountants.

## Why this exists

Block explorers are precise, but most people cannot read raw logs, internal calls, router paths, gas accounting, and token transfers with confidence. Wallet previews help before signing, but after the transaction users still need a clear record of what happened.

TxReceipts is designed for:

- Users who want a monthly receipt box for Base activity.
- Dapps that want to give users verified receipts after swaps, mints, payments, subscriptions, games, and creator support.
- Builders who need a shared schema for transaction intent, actual onchain outcome, fee breakdowns, and downloadable receipt artifacts.

## What makes it different

There are already products that make transaction hashes more readable. TxReceipts focuses on a different primitive:

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

The output is a signed receipt JSON plus a PNG receipt render target.

## Launch scope

V1 is intentionally narrow:

- Base mainnet first, with experimental multi-network lookup in the demo
- wallet-connected user receipt inbox
- transaction timeline
- receipt generation from transaction hash
- PNG receipt export
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
packages/sdk/      Dapp SDK draft
```

## Current prototype

Open `apps/web/index.html` in a browser. The first prototype is dependency-free so the project can be reviewed without a build step.

Live demo:

https://madmin27.github.io/OnchainReceipts/

## Demo walkthrough

![TxReceipts demo walkthrough](apps/web/assets/txreceipts-demo.gif)

The first live demo can fetch a transaction hash through the selected network RPC, parse receipt logs for token transfers, estimate gas paid, and render a downloadable PNG receipt artifact.

## Why not just a block explorer?

Block explorers are essential, but they are optimized for technical inspection. Most users still have to interpret raw logs, token movements, router contracts, internal calls, gas fields, and contract labels by themselves.

TxReceipts is designed for a different job:

- turn transaction outcomes into accounting-friendly receipt artifacts
- separate sent assets, received assets, gas, app fees, and protocol fees
- let dapps submit intent metadata that can be checked against observed onchain results
- produce signed, downloadable receipt JSON/PNG artifacts
- give users a monthly receipt box rather than a list of hashes

The core question is not only "what happened onchain?" It is "what did the app say would happen, what actually happened, and can the user keep a trustworthy receipt?"

## How dapps integrate

Dapps can integrate by submitting intent metadata after a Base transaction lands. The API verifies the transaction against Base onchain data before issuing a receipt. The SDK draft lives in [packages/sdk](packages/sdk), and the credit/billing design lives in [docs/sdk-billing.md](docs/sdk-billing.md).

```ts
import { TxReceipts } from '@txreceipts/sdk';

const receipts = new TxReceipts({
  apiKey: process.env.TX_RECEIPTS_API_KEY,
  projectId: 'example-swap',
});

const receipt = await receipts.createReceipt({
  chainId: 8453,
  txHash: '0x...',
  user: '0x...',
  intent: {
    type: 'swap',
    summary: 'Swap 25 USDC for ETH',
    sent: [{ symbol: 'USDC', amount: '25.00' }],
    received: [{ symbol: 'ETH', amount: '0.0068' }],
    fees: [{ type: 'app', symbol: 'USDC', amount: '0.03' }],
  },
  merchant: {
    name: 'ExampleSwap',
    reference: 'swap_123',
  },
});
```

The receipt engine returns a `verified`, `partial`, `mismatch`, or `failed` status with downloadable artifacts, machine-readable verification checks, and credit accounting details. One dapp tx credit is counted only once for each `project_id + chain_id + tx_hash`.

## Security posture

TxReceipts should never ask for private keys, seed phrases, token approvals, or spending permissions. Wallet signatures are only for login/session ownership. Receipt generation reads public Base data and optionally accepts signed dapp intent metadata.

See [docs/security-model.md](docs/security-model.md).

## License

MIT. See [LICENSE](LICENSE).
