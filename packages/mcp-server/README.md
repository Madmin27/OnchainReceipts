# TxReceipts MCP Server

Read-only MCP server for Base-first onchain pre-accounting workflows.

This package exposes wallet activity, transaction summary, and public receipt tools over stdio. It is designed for agents and local MCP clients that need deterministic wallet context without direct browser automation.

Hosted MCP endpoint:

```txt
https://api.txreceipts.com.tr/mcp
```

The hosted endpoint speaks JSON-RPC for `initialize`, `tools/list`, and `tools/call`. The local package remains the stdio option for local MCP clients.

## Tools

- `list_networks`: returns supported EVM networks and endpoints.
- `get_wallet_activity`: loads compact wallet activity from Blockscout.
- `get_transaction_summary`: loads RPC and explorer data for one transaction.
- `get_public_receipt`: fetches a public TxReceipts receipt by `receiptId`.
- `create_receipt`: optionally creates a receipt through the TxReceipts API when `TX_RECEIPTS_API_KEY` is configured.

## Environment

- `TX_RECEIPTS_API_URL`: optional, defaults to `https://api.txreceipts.com.tr`
- `TX_RECEIPTS_API_KEY`: optional, required only for `create_receipt`
- `TX_RECEIPTS_PROJECT_ID`: optional, sent with `create_receipt` when present

## Local run

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
      "command": "node",
      "args": ["packages/mcp-server/src/index.mjs"],
      "env": {
        "TX_RECEIPTS_API_URL": "https://api.txreceipts.com.tr"
      }
    }
  }
}
```

The server is read-only by default. `create_receipt` is disabled unless an API key is provided.