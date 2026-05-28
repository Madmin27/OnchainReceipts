#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const TX_RECEIPTS_API_URL = (process.env.TX_RECEIPTS_API_URL || "https://api.txreceipts.com.tr").replace(/\/+$/, "");
const TX_RECEIPTS_API_KEY = process.env.TX_RECEIPTS_API_KEY || "";
const TX_RECEIPTS_PROJECT_ID = process.env.TX_RECEIPTS_PROJECT_ID || "";

const NETWORKS = {
  base: {
    id: "base",
    name: "Base",
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    blockscoutUrl: "https://base.blockscout.com",
    explorerUrl: "https://basescan.org",
    nativeSymbol: "ETH",
  },
  ethereum: {
    id: "ethereum",
    name: "Ethereum",
    chainId: 1,
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    blockscoutUrl: "https://eth.blockscout.com",
    explorerUrl: "https://etherscan.io",
    nativeSymbol: "ETH",
  },
  optimism: {
    id: "optimism",
    name: "Optimism",
    chainId: 10,
    rpcUrl: "https://mainnet.optimism.io",
    blockscoutUrl: "https://optimism.blockscout.com",
    explorerUrl: "https://optimistic.etherscan.io",
    nativeSymbol: "ETH",
  },
  arbitrum: {
    id: "arbitrum",
    name: "Arbitrum One",
    chainId: 42161,
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    blockscoutUrl: "https://arbitrum.blockscout.com",
    explorerUrl: "https://arbiscan.io",
    nativeSymbol: "ETH",
  },
  polygon: {
    id: "polygon",
    name: "Polygon",
    chainId: 137,
    rpcUrl: "https://polygon-rpc.com",
    blockscoutUrl: "https://polygon.blockscout.com",
    explorerUrl: "https://polygonscan.com",
    nativeSymbol: "POL",
  },
};

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const RECEIPT_ID_PATTERN = /^TXR-[A-Z0-9]+-[A-F0-9]{24}$/;

const server = new McpServer({
  name: "txreceipts-mcp-server",
  version: "0.1.0",
});

server.tool(
  "list_networks",
  "List the supported read-only TxReceipts MCP networks.",
  {},
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({ networks: Object.values(NETWORKS) }, null, 2),
      },
    ],
  }),
);

server.tool(
  "get_wallet_activity",
  "Load compact wallet activity for one supported EVM network.",
  {
    wallet: z.string().describe("0x wallet address"),
    network: z.enum(["base", "ethereum", "optimism", "arbitrum", "polygon"]).default("base"),
    limit: z.number().int().min(1).max(50).default(20),
  },
  async ({ wallet, network, limit }) => {
    const normalizedWallet = normalizeAddress(wallet);
    const config = networkConfig(network);
    const [transactions, tokenTransfers] = await Promise.all([
      fetchExplorerJson(config, `/api/v2/addresses/${normalizedWallet}/transactions`, { items_count: limit }),
      fetchExplorerJson(config, `/api/v2/addresses/${normalizedWallet}/token-transfers`, { items_count: limit }),
    ]);

    const txItems = Array.isArray(transactions.items) ? transactions.items : [];
    const transferItems = Array.isArray(tokenTransfers.items) ? tokenTransfers.items : [];
    const activity = txItems.slice(0, limit).map(item => summarizeTransactionRow(item, normalizedWallet, config));
    const tokenRows = transferItems.slice(0, limit).map(item => summarizeTokenTransferRow(item, normalizedWallet));

    const payload = {
      wallet: normalizedWallet,
      network: config.name,
      totals: {
        transactions: activity.length,
        tokenTransfers: tokenRows.length,
        incomingTransactions: activity.filter(item => item.direction === "incoming").length,
        outgoingTransactions: activity.filter(item => item.direction === "outgoing").length,
      },
      transactions: activity,
      tokenTransfers: tokenRows,
    };

    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
);

server.tool(
  "get_transaction_summary",
  "Load one EVM transaction from RPC and explorer sources and summarize sent value, gas, and token movement.",
  {
    txHash: z.string().describe("0x transaction hash"),
    network: z.enum(["base", "ethereum", "optimism", "arbitrum", "polygon"]).default("base"),
  },
  async ({ txHash, network }) => {
    const normalizedHash = normalizeTxHash(txHash);
    const config = networkConfig(network);
    const [tx, receipt, block, tokenTransfers] = await Promise.all([
      rpc(config, "eth_getTransactionByHash", [normalizedHash]),
      rpc(config, "eth_getTransactionReceipt", [normalizedHash]),
      fetchExplorerJson(config, `/api/v2/transactions/${normalizedHash}/token-transfers`).catch(() => ({ items: [] })),
      Promise.resolve(null),
    ]).then(async ([transaction, txReceipt, transferPayload]) => {
      const currentBlock = txReceipt?.blockNumber ? await rpc(config, "eth_getBlockByNumber", [txReceipt.blockNumber, false]) : null;
      return [transaction, txReceipt, currentBlock, transferPayload];
    });

    if (!tx || !receipt) {
      throw new Error(`Transaction not found on ${config.name}.`);
    }

    const transfers = Array.isArray(tokenTransfers?.items) ? tokenTransfers.items.map(summarizeExplorerTransfer) : [];
    const gasFeeWei = safeBigInt(receipt.gasUsed) * safeBigInt(receipt.effectiveGasPrice || tx.gasPrice);
    const payload = {
      network: config.name,
      chainId: config.chainId,
      txHash: normalizedHash,
      status: receipt.status === "0x1" ? "verified" : "failed",
      blockNumber: hexToNumber(receipt.blockNumber),
      timestamp: block?.timestamp ? new Date(Number(safeBigInt(block.timestamp)) * 1000).toISOString() : null,
      from: tx.from,
      to: tx.to || null,
      value: formatNativeValue(tx.value, config.nativeSymbol),
      gasFee: formatNativeValue(gasFeeWei, config.nativeSymbol),
      method: tx.input && tx.input !== "0x" ? tx.input.slice(0, 10) : "native transfer",
      tokenTransfers: transfers,
      explorerUrl: `${config.explorerUrl}/tx/${normalizedHash}`,
    };

    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
);

server.tool(
  "get_public_receipt",
  "Fetch a public TxReceipts receipt by deterministic receiptId.",
  {
    receiptId: z.string().describe("TXR-NETWORK-HASH24 receipt id"),
  },
  async ({ receiptId }) => {
    const normalizedReceiptId = String(receiptId || "").trim().toUpperCase();
    if (!RECEIPT_ID_PATTERN.test(normalizedReceiptId)) {
      throw new Error("receiptId must match TXR-NETWORK-HASH24.");
    }
    const response = await fetch(`${TX_RECEIPTS_API_URL}/r/${normalizedReceiptId}`);
    if (!response.ok) {
      throw new Error(`TxReceipts public receipt error ${response.status}.`);
    }
    const payload = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
);

server.tool(
  "create_receipt",
  "Create a TxReceipts receipt through the API when TX_RECEIPTS_API_KEY is configured.",
  {
    chainId: z.number().int(),
    txHash: z.string(),
    ownerWallet: z.string(),
    intent: z.object({
      type: z.enum(["transfer", "swap", "mint", "payment", "subscription", "bridge", "approval", "unknown"]),
      summary: z.string(),
    }),
  },
  async ({ chainId, txHash, ownerWallet, intent }) => {
    if (!TX_RECEIPTS_API_KEY) {
      throw new Error("TX_RECEIPTS_API_KEY is required for create_receipt.");
    }
    const response = await fetch(`${TX_RECEIPTS_API_URL}/v1/receipts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TX_RECEIPTS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(TX_RECEIPTS_PROJECT_ID ? { projectId: TX_RECEIPTS_PROJECT_ID } : {}),
        chainId,
        txHash: normalizeTxHash(txHash),
        ownerWallet: normalizeAddress(ownerWallet),
        intent,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `TxReceipts API error ${response.status}.`);
    }
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
);

function networkConfig(network) {
  const config = NETWORKS[String(network || "base")];
  if (!config) throw new Error(`Unsupported network: ${network}`);
  return config;
}

function normalizeAddress(value) {
  const address = String(value || "").trim();
  if (!EVM_ADDRESS_PATTERN.test(address)) {
    throw new Error("wallet must be a valid 0x address.");
  }
  return address.toLowerCase();
}

function normalizeTxHash(value) {
  const txHash = String(value || "").trim();
  if (!TX_HASH_PATTERN.test(txHash)) {
    throw new Error("txHash must be a valid 0x transaction hash.");
  }
  return txHash.toLowerCase();
}

async function fetchExplorerJson(config, path, params = {}) {
  const url = new URL(path, config.blockscoutUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`${config.name} explorer error ${response.status}.`);
  }
  return response.json();
}

async function rpc(config, method, params) {
  const response = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!response.ok) {
    throw new Error(`${config.name} RPC error ${response.status}.`);
  }
  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message || `${config.name} RPC request failed.`);
  }
  return payload.result;
}

function summarizeTransactionRow(item, wallet, config) {
  const from = String(item.from?.hash || "").toLowerCase();
  const to = String(item.to?.hash || "").toLowerCase();
  const direction = to === wallet && from !== wallet
    ? "incoming"
    : from === wallet
      ? "outgoing"
      : "other";
  return {
    txHash: item.hash,
    timestamp: item.timestamp || null,
    direction,
    method: item.method || item.decoded_input?.method_call || "transaction",
    value: item.value && item.value !== "0" ? formatNativeValue(item.value, config.nativeSymbol) : null,
    fee: item.fee?.value || item.transaction_fee || item.tx_fee || null,
    from: item.from?.hash || null,
    to: item.to?.hash || null,
    status: item.status || item.result || "ok",
  };
}

function summarizeTokenTransferRow(item, wallet) {
  const from = String(item.from?.hash || "").toLowerCase();
  const to = String(item.to?.hash || "").toLowerCase();
  const direction = to === wallet && from !== wallet
    ? "incoming"
    : from === wallet
      ? "outgoing"
      : "other";
  return {
    txHash: item.transaction_hash,
    timestamp: item.timestamp || null,
    direction,
    token: item.token?.symbol || item.token?.name || item.token_type || "TOKEN",
    amount: item.total?.value || null,
    decimals: item.total?.decimals || item.token?.decimals || null,
    from: item.from?.hash || null,
    to: item.to?.hash || null,
  };
}

function summarizeExplorerTransfer(item) {
  return {
    token: item.token?.symbol || item.token?.name || "TOKEN",
    amount: item.total?.value || null,
    decimals: item.total?.decimals || item.token?.decimals || null,
    from: item.from?.hash || null,
    to: item.to?.hash || null,
  };
}

function safeBigInt(value) {
  if (typeof value === "bigint") return value;
  if (!value || value === "0x") return 0n;
  if (typeof value === "number") return BigInt(value);
  const text = String(value);
  return text.startsWith("0x") ? BigInt(text) : BigInt(text || "0");
}

function hexToNumber(value) {
  if (!value) return null;
  return Number(safeBigInt(value));
}

function formatNativeValue(value, symbol) {
  const wei = safeBigInt(value);
  const base = 10n ** 18n;
  const integer = wei / base;
  const fraction = (wei % base).toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "");
  return `${integer}${fraction ? `.${fraction}` : ""} ${symbol}`;
}

const transport = new StdioServerTransport();
await server.connect(transport);