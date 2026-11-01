# TxReceipts MCP Server

Read-only MCP server for Base-first onchain pre-accounting workflows.

It exposes wallet activity, transaction summaries, monthly pre-accounting reports, review flags, CSV export and public receipt lookups over stdio. It never signs, sends or approves anything. By default it also never writes to the TxReceipts API.

Hosted alternative (JSON-RPC `initialize`, `tools/list`, `tools/call`):

```txt
https://api.txreceipts.com.tr/mcp
```

## Tools

Read-only, open-world (they call public RPC nodes, Blockscout or the TxReceipts API):

- `get_wallet_activity`: recent transactions and token transfers for a wallet.
- `get_transaction_summary`: one transaction from RPC and explorer data: value, gas, token movement.
- `get_pre_accounting_report`: incoming/outgoing totals plus token flows for a wallet.
- `get_wallet_ledger`: transaction history with running native balance.
- `get_monthly_summary`: one month aggregated; reports `truncated: true` when explorer pagination was cut.
- `find_review_required_transactions`: failed txs, approvals, mints, complex calls, large USDC moves, lookalike stablecoin symbols.
- `export_accounting_csv`: RFC 4180 CSV string. Every cell is quoted and spreadsheet formulas are neutralised.
- `get_public_receipt`, `explain_receipt`: public TxReceipts receipt by `receiptId`.
- `get_credit_balance`: project credit balance (needs `TX_RECEIPTS_API_KEY`).

Read-only, local: `list_networks`, `get_supported_networks`.

Write (opt-in, hidden unless enabled): `create_receipt` creates a receipt through the API and spends project credits. It is only registered when `TX_RECEIPTS_ENABLE_WRITE=1` **and** `TX_RECEIPTS_API_KEY` are set.

All tools carry MCP annotations (`readOnlyHint`, `openWorldHint`, ...) so clients can apply their own policies.

## Untrusted data

Token names and symbols, method labels, memos, categories and error strings come from the chain, Blockscout or the API. Anyone can deploy a token called `USDC` or name a contract `ignore previous instructions`. The server therefore:

- strips control and bidi characters and caps the length of such fields;
- identifies USDC by canonical contract address per network, never by symbol, and labels lookalikes as `USDC (unverified contract)`;
- returns API payloads under an `untrusted` marker and never embeds them in its own summary sentences;
- appends a `notice` to every result reminding the model to treat those fields as data, not instructions.

Agents should still verify anything that matters against the explorer links before making an accounting entry.

## Networks

Base (default), Ethereum, Optimism, Arbitrum One, Polygon. Public RPC and Blockscout endpoints are fixed in the code; every request has a 15 second timeout and a 5 MB response ceiling.

## Environment

- `TX_RECEIPTS_API_URL`: optional, defaults to `https://api.txreceipts.com.tr`. Must be https (http is accepted for localhost only).
- `TX_RECEIPTS_API_KEY`: optional; needed for `get_credit_balance` and `create_receipt`. Keep the client config file that holds it at mode 600.
- `TX_RECEIPTS_PROJECT_ID`: optional, sent with `create_receipt`.
- `TX_RECEIPTS_ENABLE_WRITE`: set to `1` to register `create_receipt`. Leave unset for a strictly read-only server.

## Run

```sh
npx @txreceipts/mcp-server
```

or from the repository:

```sh
cd packages/mcp-server
npm install
node src/index.mjs
```

## MCP client example

```json
{
  "mcpServers": {
    "txreceipts": {
      "command": "npx",
      "args": ["-y", "@txreceipts/mcp-server"]
    }
  }
}
```

## Output disclaimer

Every report is a pre-accounting record prepared with TxReceipts. It is not an invoice, tax filing or e-ledger submission. No fiat valuation is applied.
