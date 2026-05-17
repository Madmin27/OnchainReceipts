# Research Notes

## Adjacent products

The market already contains human-readable transaction tools and wallet safety products. OnchainReceipts should not compete as a generic transaction hash beautifier.

### TxLens

TxLens positions itself as a way to make any onchain transaction human-readable and shareable. It supports Base and other chains and focuses on instant receipts from explorer URLs or transaction hashes.

Implication: OnchainReceipts should avoid "paste a hash, get a pretty receipt" as the only value proposition.

Source: https://txlens.xyz/

### txplain

txplain is an open-source AI-powered blockchain transaction analysis service. It focuses on RPC-first transaction explanation and human-readable summaries.

Implication: The open-source angle is not enough by itself. OnchainReceipts needs a clearer standard, dapp intent model, and accounting-ready receipt artifacts.

Source: https://github.com/txplain/txplain

### Chain Receipt and invoice tools

Several tools generate blockchain transaction documentation or crypto payment invoices. These are useful for proof and audit workflows, but they usually start from observed transaction data rather than dapp-submitted intent.

Implication: The receipt model should include both verified onchain outcomes and the app's declared business context.

## Base-specific opportunity

Base is well suited for receipts because it has:

- low-cost EVM activity
- consumer apps and mini apps
- Base Account and smart wallet UX
- OnchainKit components
- USDC payments, creator support, mints, swaps, subscriptions, and game purchases

Official Base docs highlight OnchainKit as a toolkit for wallet, transaction, checkout, fund, token, swap, and mint flows. That gives OnchainReceipts a clear integration path for builders.

Sources:

- https://docs.base.org/builderkits/onchainkit/getting-started
- https://docs.base.org/onchainkit/latest/configuration/onchainkit-provider

## Product wedge

OnchainReceipts should be:

1. User-facing enough to be useful without dapp integrations.
2. Developer-facing enough to become infrastructure.
3. More trustworthy than a block explorer screenshot.
4. More structured than an AI explanation.

The core wedge:

> The receipt compares declared transaction intent with verified Base onchain outcome.

## Design direction

The design should feel serious and calm:

- high contrast
- restrained color
- clean receipt artifact
- strong status states: verified, mismatch, failed, pending
- no over-gamified crypto visuals
- no "casino dashboard" patterns

The receipt must look like something a user would trust enough to keep for accounting.
