# AI Assistant Plan

TxReceipts should ship the receipt engine first and add an AI assistant as a product layer after the core data model is useful on its own.

The assistant should answer questions about a user's Base activity using verified receipt data, wallet history, labels, and monthly summaries. Base MCP is useful here because it can connect an agent to wallet and Base Account workflows, but it should not become the primary production indexer or the source of accounting truth.

## Product role

Working name: Ask your Base wallet.

The assistant helps users and builders ask questions such as:

- What did I spend USDC on this month?
- Which subscriptions renewed this week?
- Who paid me on Base in the last 30 days?
- Which receipts are verified, partial, or mismatched?
- Export my May creator income summary.
- Explain this transaction in plain English.

The assistant should always link back to receipt artifacts, transaction hashes, and verification checks. It should not ask users to trust a summary without showing the source records.

## Where Base MCP fits

Use Base MCP for:

- opt-in natural language wallet analysis;
- onboarding demos that read balances and recent activity;
- developer workflows that test Base Account, transaction, or x402 flows;
- future agent-facing APIs where x402 payments can charge per enrichment or receipt request.

Do not use Base MCP for:

- the canonical receipt verification engine;
- private key custody;
- token approvals or spending permissions;
- background actions without explicit user intent;
- tax, legal, or accounting finality claims.

Production receipt verification should continue to use deterministic RPC and indexer sources, cached receipt records, schema validation, and reproducible verification checks.

## MVP sequence

1. Build the Base receipt inbox and transaction hash receipt generator.
2. Add dapp intent metadata and verified receipt status.
3. Store user labels, categories, and monthly summaries.
4. Add an assistant panel that can answer read-only questions from cached receipt data.
5. Add Base MCP only for opt-in wallet actions and demos after the read-only assistant is useful.

## Safety rules

- The assistant starts read-only.
- Any action-capable flow must show the exact operation before a wallet confirmation.
- The app must never request seed phrases, private keys, broad approvals, or spending permissions.
- The assistant should expose uncertainty, for example "unknown merchant" or "partial receipt".
- Users must be able to delete labels and cached assistant context.

## Monetization fit

The assistant is strongest as a paid builder and creator feature, not as the initial consumer paywall.

Possible paid features:

- monthly creator income summaries;
- CSV/PDF report generation;
- natural language receipt search;
- dapp support assistant for "what happened to my transaction?";
- x402 pay-per-request receipt enrichment for external agents.
