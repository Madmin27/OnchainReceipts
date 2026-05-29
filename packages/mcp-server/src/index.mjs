#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  mcpNetworkCapabilities,
  networkCapabilitiesForReceipt,
} from "../../../src/networks/capabilities.mjs";

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
        text: JSON.stringify({
          networks: Object.values(NETWORKS).map(network => ({
            ...network,
            networkCapabilities: mcpNetworkCapabilities(networkCapabilitiesForReceipt({ network: network.id, chainId: network.chainId })),
          })),
          security: {
            readOnly: true,
            signsTransactions: false,
            sendsTransfers: false,
            requestsApprovals: false,
          },
        }, null, 2),
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
    const capabilities = networkCapabilitiesForReceipt({ network: config.id, chainId: config.chainId });
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
      networkCapabilities: mcpNetworkCapabilities(capabilities),
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
    const capabilities = networkCapabilitiesForReceipt({ network: config.id, chainId: config.chainId });
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
      networkCapabilities: mcpNetworkCapabilities(capabilities),
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

server.tool(
  "get_pre_accounting_report",
  "Generate a pre-accounting report for a wallet on Base network. Returns token flows, gas summary, and network capability context for accounting purposes. Best used with Base (default) for full feature support including paymaster and X402 readiness.",
  {
    wallet: z.string().describe("0x wallet address"),
    network: z.enum(["base", "ethereum", "optimism", "arbitrum", "polygon"]).default("base"),
    limit: z.number().int().min(1).max(100).default(30),
  },
  async ({ wallet, network, limit }) => {
    const normalizedWallet = normalizeAddress(wallet);
    const config = networkConfig(network);
    const capabilities = networkCapabilitiesForReceipt({ network: config.id, chainId: config.chainId });
    const [transactions, tokenTransfers] = await Promise.all([
      fetchExplorerJson(config, `/api/v2/addresses/${normalizedWallet}/transactions`, { items_count: limit }),
      fetchExplorerJson(config, `/api/v2/addresses/${normalizedWallet}/token-transfers`, { items_count: limit }),
    ]);
    const txItems = Array.isArray(transactions.items) ? transactions.items : [];
    const transferItems = Array.isArray(tokenTransfers.items) ? tokenTransfers.items : [];
    const activity = txItems.slice(0, limit).map(item => summarizeTransactionRow(item, normalizedWallet, config));
    const tokenRows = transferItems.slice(0, limit).map(item => summarizeTokenTransferRow(item, normalizedWallet));
    const incoming = activity.filter(t => t.direction === "incoming");
    const outgoing = activity.filter(t => t.direction === "outgoing");
    const totalIncomingValue = incoming.reduce((sum, t) => sum + parseFloat(t.value || "0"), 0);
    const totalOutgoingValue = outgoing.reduce((sum, t) => sum + parseFloat(t.value || "0"), 0);
    const isBase = network === "base";
    const payload = {
      preAccountingReport: true,
      disclaimer: "This output is a pre-accounting record prepared with TxReceipts and is not an official invoice, tax filing, or e-ledger submission. Consult a licensed accountant for formal reporting.",
      generatedAt: new Date().toISOString(),
      wallet: normalizedWallet,
      network: config.name,
      chainId: config.chainId,
      isBase,
      baseFeatures: isBase ? {
        supportsMcp: true,
        supportsX402: true,
        supportsBuilderCodes: true,
        supportsPaymaster: true,
        supportsBaseAccount: true,
        preferredStablecoin: "USDC",
        nativeGasToken: "ETH",
        verificationNote: "Receipts on Base are anchored to L2 with fast finality (~2 seconds). Verification uses Base block timestamp, transaction hash, and onchain token movements.",
      } : undefined,
      summary: {
        totalTransactions: activity.length,
        incomingTransactions: incoming.length,
        outgoingTransactions: outgoing.length,
        totalTokenTransfers: tokenRows.length,
        totalIncomingValue: `${totalIncomingValue.toFixed(6)} ${config.nativeSymbol}`,
        totalOutgoingValue: `${totalOutgoingValue.toFixed(6)} ${config.nativeSymbol}`,
        netFlow: `${(totalIncomingValue - totalOutgoingValue).toFixed(6)} ${config.nativeSymbol}`,
      },
      networkCapabilities: mcpNetworkCapabilities(capabilities),
      transactions: activity,
      tokenTransfers: tokenRows,
    };
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
);

server.tool(
  "get_supported_networks",
  "List all supported EVM networks with their capabilities, gas token, stablecoin, MCP readiness, and pre-accounting features.",
  {},
  async () => {
    const networks = {};
    for (const [id, config] of Object.entries(NETWORKS)) {
      const capabilities = networkCapabilitiesForReceipt({ network: id, chainId: config.chainId });
      networks[id] = {
        name: config.name,
        chainId: config.chainId,
        nativeSymbol: config.nativeSymbol,
        stablecoin: id === "base" ? { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 } : null,
        features: {
          mcp: true,
          x402: id === "base",
          paymaster: id === "base",
          baseAccount: id === "base",
          builderCodes: id === "base",
        },
        networkCapabilities: mcpNetworkCapabilities(capabilities),
        explorerUrl: config.explorerUrl,
        blockscoutUrl: config.blockscoutUrl,
      };
    }
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          defaultNetwork: "base",
          preferredStablecoin: "USDC",
          nativeGasToken: "ETH",
          readOnly: true,
          baseChainId: 8453,
          networks,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "get_credit_balance",
  "Check the USDC credit balance and API usage quota for the authenticated project. Requires TX_RECEIPTS_API_KEY to be configured. Uses connectedAddress semantics for billing wallet credit.",
  {},
  async () => {
    if (!TX_RECEIPTS_API_KEY) {
      throw new Error("TX_RECEIPTS_API_KEY is required for get_credit_balance.");
    }
    const response = await fetch(`${TX_RECEIPTS_API_URL}/v1/projects/me/usage`, {
      headers: { Authorization: `Bearer ${TX_RECEIPTS_API_KEY}` },
    });
    if (!response.ok) {
      throw new Error(`Credit balance API error ${response.status}.`);
    }
    const payload = await response.json();
    return { content: [{ type: "text", text: JSON.stringify({
      ...payload,
      semantics: "connectedAddress — credit balance tied to the project billing wallet",
    }, null, 2) }] };
  },
);

server.tool(
  "get_wallet_ledger",
  "Load wallet transaction history with running balance across native and USDC token movement. Uses useAddress semantics for comprehensive pre-accounting analysis.",
  {
    wallet: z.string().describe("0x wallet address to analyze"),
    network: z.enum(["base", "ethereum", "optimism", "arbitrum", "polygon"]).default("base"),
    limit: z.number().int().min(1).max(100).default(30),
  },
  async ({ wallet, network, limit }) => {
    const normalizedWallet = normalizeAddress(wallet);
    const config = networkConfig(network);
    const capabilities = networkCapabilitiesForReceipt({ network: config.id, chainId: config.chainId });
    const [transactions, tokenTransfers] = await Promise.all([
      fetchExplorerJson(config, `/api/v2/addresses/${normalizedWallet}/transactions`, { items_count: limit }),
      fetchExplorerJson(config, `/api/v2/addresses/${normalizedWallet}/token-transfers`, { items_count: limit }),
    ]);
    const txItems = Array.isArray(transactions.items) ? transactions.items : [];
    const transferItems = Array.isArray(tokenTransfers.items) ? tokenTransfers.items : [];

    const ledger = [];
    let runningNativeBalance = 0n;
    for (const item of txItems.slice(0, limit)) {
      const from = String(item.from?.hash || "").toLowerCase();
      const to = String(item.to?.hash || "").toLowerCase();
      const direction = to === normalizedWallet && from !== normalizedWallet ? "incoming" : from === normalizedWallet ? "outgoing" : "other";
      const valueWei = item.value ? safeBigInt(item.value) : 0n;
      if (direction === "incoming") runningNativeBalance += valueWei;
      if (direction === "outgoing") runningNativeBalance -= valueWei;
      const feeWei = item.fee?.wei ? safeBigInt(item.fee.wei) : 0n;
      if (direction === "outgoing") runningNativeBalance -= feeWei;
      ledger.push({
        txHash: item.hash,
        timestamp: item.timestamp || null,
        direction,
        method: item.method || item.decoded_input?.method_call || "transaction",
        nativeValue: item.value && item.value !== "0" ? formatNativeValue(item.value, config.nativeSymbol) : null,
        feeWei: feeWei.toString(),
        from: item.from?.hash || null,
        to: item.to?.hash || null,
        status: item.status || item.result || "ok",
        runningNativeBalance: formatNativeValue(runningNativeBalance, config.nativeSymbol),
      });
    }

    const tokenLedger = transferItems.slice(0, limit).map(item => {
      const from = String(item.from?.hash || "").toLowerCase();
      const to = String(item.to?.hash || "").toLowerCase();
      const direction = to === normalizedWallet && from !== normalizedWallet ? "incoming" : from === normalizedWallet ? "outgoing" : "other";
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
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          wallet: normalizedWallet,
          network: config.name,
          chainId: config.chainId,
          semantics: "useAddress — wallet ledger for pre-accounting analysis",
          summary: {
            totalTransactions: ledger.length,
            incomingTransactions: ledger.filter(l => l.direction === "incoming").length,
            outgoingTransactions: ledger.filter(l => l.direction === "outgoing").length,
            totalTokenTransfers: tokenLedger.length,
          },
          networkCapabilities: mcpNetworkCapabilities(capabilities),
          ledger,
          tokenTransfers: tokenLedger,
          runningNativeBalance: ledger.length > 0 ? ledger[ledger.length - 1].runningNativeBalance : null,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "get_monthly_summary",
  "Aggregate wallet activity into a monthly pre-accounting summary with total incoming/outgoing value, gas costs, top transactions, and category grouping. Uses useAddress semantics.",
  {
    wallet: z.string().describe("0x wallet address"),
    network: z.enum(["base", "ethereum", "optimism", "arbitrum", "polygon"]).default("base"),
    year: z.number().int().describe("4-digit year"),
    month: z.number().int().min(1).max(12).describe("1-12 month number"),
  },
  async ({ wallet, network, year, month }) => {
    const normalizedWallet = normalizeAddress(wallet);
    const config = networkConfig(network);
    const capabilities = networkCapabilitiesForReceipt({ network: config.id, chainId: config.chainId });
    const limit = 200;
    const [transactions, tokenTransfers] = await Promise.all([
      fetchExplorerJson(config, `/api/v2/addresses/${normalizedWallet}/transactions`, { items_count: limit }),
      fetchExplorerJson(config, `/api/v2/addresses/${normalizedWallet}/token-transfers`, { items_count: limit }),
    ]);
    const txItems = Array.isArray(transactions.items) ? transactions.items : [];
    const transferItems = Array.isArray(tokenTransfers.items) ? tokenTransfers.items : [];

    const monthTx = txItems.filter(item => {
      if (!item.timestamp) return false;
      const d = new Date(item.timestamp);
      return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });
    const monthTransfer = transferItems.filter(item => {
      if (!item.timestamp) return false;
      const d = new Date(item.timestamp);
      return d.getFullYear() === year && (d.getMonth() + 1) === month;
    });

    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const rows = monthTx.slice(0, 100).map(item => summarizeTransactionRow(item, normalizedWallet, config));
    const tokens = monthTransfer.slice(0, 100).map(item => summarizeTokenTransferRow(item, normalizedWallet));
    const incoming = rows.filter(r => r.direction === "incoming");
    const outgoing = rows.filter(r => r.direction === "outgoing");
    const totalIncomingNative = incoming.reduce((sum, r) => sum + parseFloat((r.value || "0").split(" ")[0] || "0"), 0);
    const totalOutgoingNative = outgoing.reduce((sum, r) => sum + parseFloat((r.value || "0").split(" ")[0] || "0"), 0);
    const categories = {};
    for (const r of rows) {
      const cat = r.method || "unknown";
      categories[cat] = (categories[cat] || 0) + 1;
    }
    const topTransactions = [...rows].sort((a, b) => {
      const aVal = parseFloat((a.value || "0").split(" ")[0] || "0");
      const bVal = parseFloat((b.value || "0").split(" ")[0] || "0");
      return bVal - aVal;
    }).slice(0, 5);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          wallet: normalizedWallet,
          network: config.name,
          month: monthStr,
          semantics: "useAddress — monthly aggregation for accounting",
          summary: {
            totalTransactions: rows.length,
            incomingTransactions: incoming.length,
            outgoingTransactions: outgoing.length,
            totalTokenTransfers: tokens.length,
            totalIncomingNative: `${totalIncomingNative.toFixed(6)} ${config.nativeSymbol}`,
            totalOutgoingNative: `${totalOutgoingNative.toFixed(6)} ${config.nativeSymbol}`,
            netNativeFlow: `${(totalIncomingNative - totalOutgoingNative).toFixed(6)} ${config.nativeSymbol}`,
          },
          networkCapabilities: mcpNetworkCapabilities(capabilities),
          categoryBreakdown: categories,
          topTransactions,
          tokenTransfers: tokens,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "find_review_required_transactions",
  "Flag wallet transactions that may need manual review: large values, failed status, unclassified categories, or unusual method calls. Uses useAddress semantics for compliance review.",
  {
    wallet: z.string().describe("0x wallet address"),
    network: z.enum(["base", "ethereum", "optimism", "arbitrum", "polygon"]).default("base"),
    limit: z.number().int().min(1).max(100).default(50),
    minValueUsd: z.number().optional().describe("Minimum USD value threshold to flag"),
  },
  async ({ wallet, network, limit, minValueUsd }) => {
    const normalizedWallet = normalizeAddress(wallet);
    const config = networkConfig(network);
    const capabilities = networkCapabilitiesForReceipt({ network: config.id, chainId: config.chainId });
    const [transactions, tokenTransfers] = await Promise.all([
      fetchExplorerJson(config, `/api/v2/addresses/${normalizedWallet}/transactions`, { items_count: limit }),
      fetchExplorerJson(config, `/api/v2/addresses/${normalizedWallet}/token-transfers`, { items_count: limit }),
    ]);
    const txItems = Array.isArray(transactions.items) ? transactions.items : [];
    const transferItems = Array.isArray(tokenTransfers.items) ? tokenTransfers.items : [];

    const flagged = [];
    for (const item of txItems.slice(0, limit)) {
      const reasons = [];
      const from = String(item.from?.hash || "").toLowerCase();
      const to = String(item.to?.hash || "").toLowerCase();
      const direction = to === normalizedWallet && from !== normalizedWallet ? "incoming" : from === normalizedWallet ? "outgoing" : "other";
      const valueWei = item.value ? safeBigInt(item.value) : 0n;
      const valueEth = Number(valueWei) / 1e18;

      if (valueEth > 1) reasons.push({ flag: "large_value", detail: `${valueEth.toFixed(4)} ${config.nativeSymbol}` });
      if (minValueUsd !== undefined && valueEth * 3000 > minValueUsd) reasons.push({ flag: "above_threshold", detail: `${valueEth.toFixed(4)} ${config.nativeSymbol}` });
      if (item.status === "failed" || item.result === "fail") reasons.push({ flag: "failed_transaction", detail: item.error || "tx failed" });
      if (item.method === "approve" || item.method === "approval") reasons.push({ flag: "token_approval", detail: "ERC-20 approval" });
      if (direction === "incoming" && from === "0x0000000000000000000000000000000000000000") reasons.push({ flag: "mint_or_wrap", detail: "zero-address sender (mint/wrap)" });
      if (item.method && /multi|batch|swap|bridge/i.test(item.method)) reasons.push({ flag: "complex_interaction", detail: item.method });

      if (reasons.length > 0) {
        flagged.push({
          txHash: item.hash,
          timestamp: item.timestamp || null,
          direction,
          method: item.method || "transaction",
          value: item.value && item.value !== "0" ? formatNativeValue(item.value, config.nativeSymbol) : "0",
          flags: reasons,
          from: item.from?.hash || null,
          to: item.to?.hash || null,
        });
      }
    }

    for (const item of transferItems) {
      const from = String(item.from?.hash || "").toLowerCase();
      const to = String(item.to?.hash || "").toLowerCase();
      const amount = item.total?.value || "0";
      const tokenSymbol = item.token?.symbol || "TOKEN";
      if (tokenSymbol === "USDC" && BigInt(amount || "0") > BigInt(1000e6)) {
        const hash = item.transaction_hash;
        if (!flagged.some(f => f.txHash === hash)) {
          flagged.push({
            txHash: hash,
            timestamp: item.timestamp || null,
            direction: to === normalizedWallet ? "incoming" : "outgoing",
            method: "token_transfer",
            value: `${(Number(amount) / 1e6).toFixed(2)} ${tokenSymbol}`,
            flags: [{ flag: "large_token_transfer", detail: `${(Number(amount) / 1e6).toFixed(2)} ${tokenSymbol}` }],
            from: item.from?.hash || null,
            to: item.to?.hash || null,
          });
        }
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          wallet: normalizedWallet,
          network: config.name,
          semantics: "useAddress — compliance review flagging",
          reviewRequiredCount: flagged.length,
          totalTransactionsReviewed: txItems.length,
          totalTokenTransfersReviewed: transferItems.length,
          networkCapabilities: mcpNetworkCapabilities(capabilities),
          flaggedTransactions: flagged,
          note: "Transactions flagged for manual review. Verify each against onchain explorer before accounting entry.",
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "export_accounting_csv",
  "Export wallet transaction history as a CSV string suitable for accounting software import. Uses useAddress semantics. Returns CSV content with headers: txHash,timestamp,direction,method,value,gasFee,token,amount,from,to,status.",
  {
    wallet: z.string().describe("0x wallet address"),
    network: z.enum(["base", "ethereum", "optimism", "arbitrum", "polygon"]).default("base"),
    limit: z.number().int().min(1).max(200).default(100),
  },
  async ({ wallet, network, limit }) => {
    const normalizedWallet = normalizeAddress(wallet);
    const config = networkConfig(network);
    const capabilities = networkCapabilitiesForReceipt({ network: config.id, chainId: config.chainId });
    const [transactions, tokenTransfers] = await Promise.all([
      fetchExplorerJson(config, `/api/v2/addresses/${normalizedWallet}/transactions`, { items_count: limit }),
      fetchExplorerJson(config, `/api/v2/addresses/${normalizedWallet}/token-transfers`, { items_count: limit }),
    ]);
    const txItems = Array.isArray(transactions.items) ? transactions.items : [];
    const transferItems = Array.isArray(tokenTransfers.items) ? tokenTransfers.items : [];

    const csvRows = [];
    csvRows.push("txHash,timestamp,direction,method,value,gasFee,token,amount,from,to,status");
    for (const item of txItems.slice(0, limit)) {
      const from = String(item.from?.hash || "").toLowerCase();
      const to = String(item.to?.hash || "").toLowerCase();
      const direction = to === normalizedWallet && from !== normalizedWallet ? "incoming" : from === normalizedWallet ? "outgoing" : "other";
      const value = item.value && item.value !== "0" ? formatNativeValue(item.value, config.nativeSymbol) : "0";
      const fee = item.fee?.value || "";
      csvRows.push([
        item.hash,
        item.timestamp || "",
        direction,
        `"${(item.method || "transaction").replace(/"/g, '""')}"`,
        `"${value}"`,
        `"${fee}"`,
        "",
        "",
        item.from?.hash || "",
        item.to?.hash || "",
        item.status || "ok",
      ].join(","));
    }
    for (const item of transferItems) {
      const hash = item.transaction_hash;
      if (csvRows.some(r => r.startsWith(hash))) continue;
      const from = String(item.from?.hash || "").toLowerCase();
      const to = String(item.to?.hash || "").toLowerCase();
      const direction = to === normalizedWallet && from !== normalizedWallet ? "incoming" : from === normalizedWallet ? "outgoing" : "other";
      const tokenSymbol = item.token?.symbol || item.token?.name || "TOKEN";
      const amount = item.total?.value || "0";
      csvRows.push([
        hash,
        item.timestamp || "",
        direction,
        "token_transfer",
        "",
        "",
        tokenSymbol,
        amount,
        item.from?.hash || "",
        item.to?.hash || "",
        "ok",
      ].join(","));
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          wallet: normalizedWallet,
          network: config.name,
          chainId: config.chainId,
          semantics: "useAddress — accounting CSV export",
          preAccountingDisclaimer: "This output is a pre-accounting record prepared with TxReceipts and is not an official invoice, tax filing, or e-ledger submission.",
          rowCount: csvRows.length - 1,
          csv: csvRows.join("\n"),
          networkCapabilities: mcpNetworkCapabilities(capabilities),
          mimeType: "text/csv",
          filename: `txreceipts_${normalizedWallet.slice(2, 10)}_${config.id}_${new Date().toISOString().slice(0, 10)}.csv`,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "explain_receipt",
  "Generate a human-readable explanation of a TxReceipts receipt with onchain verification status, network capabilities context, and pre-accounting disclaimer.",
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
    const receipt = await response.json();
    const networkName = NETWORKS[String(receipt.network || "").toLowerCase()]?.name || receipt.network || "unknown";
    const shortHash = receipt.txHash ? `${receipt.txHash.slice(0, 10)}...${receipt.txHash.slice(-6)}` : "N/A";
    const shortWallet = receipt.ownerWallet ? `${receipt.ownerWallet.slice(0, 6)}...${receipt.ownerWallet.slice(-4)}` : "N/A";

    let capabilities = null;
    try {
      const cap = networkCapabilitiesForReceipt({ network: String(receipt.network || "").toLowerCase(), chainId: Number(receipt.chainId || 0) });
      capabilities = mcpNetworkCapabilities(cap);
    } catch { /* ignore */ }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          receiptId: receipt.receiptId,
          network: networkName,
          chainId: receipt.chainId,
          semantics: "explain_receipt — human-readable verification",
          summary: `Receipt ${receipt.receiptId} on ${networkName} (chain ${receipt.chainId}) for transaction ${shortHash} from wallet ${shortWallet}. Status: ${receipt.verificationStatus || receipt.status}.`,
          details: {
            txHash: receipt.txHash,
            ownerWallet: receipt.ownerWallet,
            direction: receipt.direction,
            category: receipt.category || "uncategorized",
            memo: receipt.memo || null,
            accountingNote: receipt.accountingNote || null,
            businessExpense: receipt.businessExpense || false,
            verificationStatus: receipt.verificationStatus || receipt.status,
          },
          networkCapabilities: capabilities,
          verification: {
            verified: (receipt.verificationStatus || receipt.status) === "verified",
            method: "Onchain transaction hash + block timestamp verification",
            note: "Receipt is anchored to the onchain transaction. Verify independently on the explorer.",
          },
          receiptUrl: receipt.receiptUrl || null,
          preAccountingDisclaimer: "This output is a pre-accounting record prepared with TxReceipts and is not an official invoice, tax filing, or e-ledger submission.",
        }, null, 2),
      }],
    };
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