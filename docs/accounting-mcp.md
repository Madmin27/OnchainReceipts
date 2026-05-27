# Accounting MCP Plan

TxReceipts should treat MCP as a selected-network data collection layer for pre-accounting, not as a general chat surface.

## Goal

Help users and accountants prepare clean wallet activity reports from Base-first data:

- transaction summaries;
- incoming and outgoing counts;
- token movement rows;
- gas and network fee notes;
- uncategorized or failed rows that need review;
- receipt status and evidence;
- CSV and print-to-PDF exports.

## MCP scope

The assistant must focus only on the network selected in the app. It should not spend tokens analyzing unrelated chains, unrelated wallets, or raw logs that the receipt engine has not compacted.

Allowed MCP-style inputs:

- selected wallet address;
- selected network;
- compact receipt JSON;
- loaded wallet history rows;
- verified receipt status and evidence.

Avoid sending:

- raw MCP output;
- full RPC logs;
- full wallet history across all networks;
- private labels not needed for the current answer;
- unrelated chains.

## Pre-accounting workflow

1. Load selected-network wallet history.
2. Normalize rows into incoming, outgoing, token, and unknown groups.
3. Surface review counts before the user exports anything.
4. Let the user select a transaction or use the latest transaction.
5. Generate template answers for common accounting questions.
6. Export CSV for spreadsheet work.
7. Use browser print as the first PDF path.
8. Log unknown questions as future ready-question candidates.

AI remains fallback-only. The default path should be deterministic templates.
