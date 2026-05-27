# TxReceipts

Open-source pre-accounting workspace for Base wallet activity.

TxReceipts turns complex onchain activity into accounting-ready wallet records people can review, export, reconcile, and trust. The long-term goal is not just to decode a transaction hash. It is to help users and accountants understand income, expenses, fees, token movements, and exception rows, then produce clean reports and short printable transaction notes when needed.

## Why this exists

Block explorers are precise, but most people cannot turn raw logs, internal calls, router paths, gas fields, and token transfers into monthly bookkeeping. Wallet previews help before signing, but after the transaction users still need records that an accountant can review.

TxReceipts is designed for:

- Users who want a monthly wallet activity report for Base.
- Accountants who need incoming, outgoing, fee, token, and review rows without reading explorer logs.
- Dapps that want to attach business context after swaps, mints, payments, subscriptions, games, and creator support.
- Builders who need a shared schema for transaction intent, actual onchain outcome, fee breakdowns, and printable transaction notes.

## What makes it different

There are already products that make transaction hashes more readable. TxReceipts focuses on a more practical accounting primitive:

**Intent plus verification.**

A dapp can send intent metadata after a transaction:

- what the user intended to do
- expected input and output assets
- app fee, protocol fee, merchant, category, and accounting note
- app identity and branding

The accounting verification engine then checks Base onchain data:

- transaction success
- sender and recipient relationships
- ERC-20 transfers
- gas paid
- observed fees
- whether the actual result matches the submitted intent

The output is an accounting-ready record. A short printable receipt can also be generated for a selected transaction.

## Launch scope

V1 is intentionally narrow:

- Base mainnet first, with experimental multi-network lookup in the demo
- wallet-connected pre-accounting inbox
- transaction timeline
- short printable transaction note from transaction hash
- monthly summary
- Excel-readable CSV wallet report export
- print-to-PDF wallet accounting report
- zero-token ready-question assistant for wallet accounting questions
- pre-accounting panel with selected-network review counts and export readiness
- open accounting record and receipt schema
- dapp intent schema and SDK draft
- AI assistant plan for read-only Base wallet questions

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
apps/api/          Cloudflare Worker API draft for credits, top-ups, and receipt usage
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

The first live demo connects to wallet activity, separates incoming and outgoing rows, highlights records needing review, and prepares CSV or print-to-PDF accounting output. A selected transaction can also produce a short printable receipt note with token movement, status, and gas paid.

## Why not just a block explorer?

Block explorers are essential, but they are optimized for technical inspection. Most users still have to interpret raw logs, token movements, router contracts, internal calls, gas fields, and contract labels by themselves.

TxReceipts is designed for a different job:

- turn wallet activity into accounting-friendly records
- separate sent assets, received assets, gas, app fees, and protocol fees
- let dapps submit intent metadata that can be checked against observed onchain results
- produce CSV, PDF, and short printable transaction outputs
- give users a monthly bookkeeping workspace rather than a list of hashes

The core question is not only "what happened onchain?" It is "what is income, what is expense, what needs review, and can the user hand this to accounting?"

## AI assistant layer

The accounting engine stays first. Base MCP is planned as an opt-in assistant layer for questions like "what did I spend USDC on this month?" or "which creator payments did I receive?" rather than as the canonical verification backend.

The current prototype uses a zero-token assistant pattern:

- ready-question buttons for common wallet accounting questions;
- Turkish and English keyword routing before any AI call;
- template answers for gas fees, token movements, status, verification, monthly spend, and top activity;
- selected-network scope, so answers focus only on the connected network's loaded data;
- local logging of unknown questions as future ready-question candidates;
- AI fallback preserved as a controlled server-side layer for questions that templates cannot answer.

See [docs/ai-assistant.md](docs/ai-assistant.md).

The accounting MCP plan is documented in [docs/accounting-mcp.md](docs/accounting-mcp.md). MCP should act as a selected-network data collection layer, while reports remain deterministic and template-first. AI can stay in the product as a fallback and learning layer, but it should receive only compact accounting context.

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

The verification engine returns a `verified`, `partial`, `mismatch`, or `failed` status with downloadable artifacts, machine-readable checks, and credit accounting details. One dapp tx credit is counted only once for each `project_id + chain_id + tx_hash`.

## Payments and tx credits

Dapp credits start as prepaid native USDC on Base. A project can register billing wallets, send USDC to the TxReceipts treasury wallet, and receive credits after the transfer is confirmed and reconciled.

The launch rule is simple:

```txt
1 USDC = 1,000 verified receipt credits
minimum top-up: 5 USDC
```

See [docs/usdc-payments.md](docs/usdc-payments.md) and [docs/sdk-billing.md](docs/sdk-billing.md).

The backend deployment path is documented in [docs/backend-deployment.md](docs/backend-deployment.md). The API draft uses Cloudflare Workers and D1 to automate project credits, Base USDC top-ups, scheduled payment confirmation, and receipt credit usage.

## Security posture

TxReceipts should never ask for private keys, seed phrases, token approvals, or spending permissions. Wallet signatures are only for login/session ownership. Receipt generation reads public Base data and optionally accepts signed dapp intent metadata.

See [docs/security-model.md](docs/security-model.md).

## License

MIT. See [LICENSE](LICENSE).
