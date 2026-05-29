import {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  CREDIT_OVERDRAFT_LIMIT,
  FREE_API_REQUESTS,
  REQUIRED_CONFIRMATIONS,
  creditsForUsdc,
  formatUsdcUnits,
  normalizeAddress,
  validateObservedTransfer,
  validateTopUpIntent,
} from "./billing.mjs";
import { detectQuestionRoute, routingNote } from "./questionRouter.mjs";
import {
  mcpNetworkCapabilities,
  networkCapabilitiesForReceipt,
  networkCapabilitiesSummary,
} from "../../../src/networks/capabilities.mjs";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const RECEIPT_BASE_URL = "https://txreceipts.com.tr";
const CHAIN_NETWORK_CODE = {
  1: "ETH",
  137: "POLYGON",
  8453: "BASE",
  42161: "ARB",
};
const MCP_PROTOCOL_VERSION = "2024-11-05";
const MCP_SERVER_INFO = { name: "txreceipts-mcp", version: "0.1.0" };
const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MCP_NETWORKS = {
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
const RECEIPT_EDITABLE_FIELDS = ["memo", "category", "accountingNote", "businessExpense"];

let schemaReadyPromise = null;

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },
  async scheduled(_event, env) {
    await scanBaseUsdcTransfers(env);
  },
};

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return corsResponse(null, env, request, 204);
  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, service: "txreceipts-api" }, env, request);
  }
  if (url.pathname === "/mcp" && request.method === "GET") {
    return json({ ok: true, service: "txreceipts-mcp", protocolVersion: MCP_PROTOCOL_VERSION }, env, request);
  }

  await ensureReceiptSchema(env);

  try {
    if (url.pathname === "/mcp" && request.method === "POST") {
      return json(await handleMcpRequest(request, env), env, request);
    }
    if (request.method === "POST" && url.pathname === "/v1/admin/projects") {
      await requireAdmin(request, env);
      return json(await createProject(request, env), env, request, 201);
    }
    if (request.method === "POST" && url.pathname === "/v1/projects/free") {
      return json(await createFreeProject(request, env), env, request, 201);
    }
    if (request.method === "POST" && url.pathname === "/v1/credits/topups") {
      const project = await requireProject(request, env);
      return json(await createTopUp(request, env, project), env, request, 201);
    }
    const reconcileTopUpMatch = url.pathname.match(/^\/v1\/credits\/topups\/([^/]+)\/reconcile$/);
    if (request.method === "POST" && reconcileTopUpMatch) {
      const project = await requireProject(request, env);
      return json(await reconcileTopUpTransfer(request, env, project, reconcileTopUpMatch[1]), env, request);
    }
    if (request.method === "GET" && url.pathname === "/v1/credits/topups") {
      const project = await requireProject(request, env);
      return json(await listTopUps(env, project.id), env, request);
    }
    const topUpMatch = url.pathname.match(/^\/v1\/credits\/topups\/([^/]+)$/);
    if (request.method === "GET" && topUpMatch) {
      const project = await requireProject(request, env);
      return json(await getTopUp(env, project.id, topUpMatch[1]), env, request);
    }
    const projectCreditsMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)\/credits$/);
    if (request.method === "GET" && projectCreditsMatch) {
      const project = await requireProject(request, env);
      if (project.id !== projectCreditsMatch[1]) throw httpError(403, "Project mismatch.");
      return json(await projectCredits(env, project.id), env, request);
    }
    if (request.method === "POST" && url.pathname === "/v1/receipts") {
      const project = await requireProject(request, env);
      return json(await createReceipt(request, env, project), env, request, 201);
    }
    const receiptMatch = url.pathname.match(/^\/v1\/receipts\/([^/]+)$/);
    if (request.method === "GET" && receiptMatch) {
      const project = await requireProject(request, env);
      return json(await getReceipt(env, project.id, receiptMatch[1]), env, request);
    }
    if (request.method === "PATCH" && receiptMatch) {
      const project = await requireProject(request, env);
      return json(await updateReceipt(request, env, project, receiptMatch[1]), env, request);
    }
    const publicReceiptMatch = url.pathname.match(/^\/r\/(TXR-[A-Z0-9]+-[A-F0-9]{24})$/);
    if (request.method === "GET" && publicReceiptMatch) {
      return json(await getPublicReceipt(env, publicReceiptMatch[1]), env, request);
    }
    if (request.method === "POST" && url.pathname === "/v1/ai/accounting-answer") {
      return json(await answerAccountingQuestion(request, env), env, request);
    }
    return json({ error: "Not found" }, env, request, 404);
  } catch (error) {
    return json({ error: error.message || "Unexpected error" }, env, request, error.status || 500);
  }
}

async function handleMcpRequest(request, env) {
  const body = await readJson(request);
  const method = String(body.method || "");
  const id = body.id ?? null;

  try {
    if (method === "initialize") {
      return mcpResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
      });
    }
    if (method === "notifications/initialized") {
      return { jsonrpc: "2.0", result: {} };
    }
    if (method === "tools/list") {
      return mcpResult(id, { tools: mcpTools() });
    }
    if (method === "tools/call") {
      const params = body.params || {};
      const result = await callMcpTool(params.name, params.arguments || {}, request, env);
      return mcpResult(id, result);
    }
    if (method === "ping") {
      return mcpResult(id, {});
    }
    return mcpError(id, -32601, `Unsupported MCP method: ${method}`);
  } catch (error) {
    return mcpError(id, error.status === 401 ? -32001 : -32000, error.message || "MCP tool error");
  }
}

function mcpTools() {
  return [
    {
      name: "list_networks",
      description: "List the supported read-only TxReceipts MCP networks.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "get_wallet_activity",
      description: "Load compact wallet activity for one supported EVM network.",
      inputSchema: {
        type: "object",
        properties: {
          wallet: { type: "string", description: "0x wallet address" },
          network: { type: "string", enum: Object.keys(MCP_NETWORKS), default: "base" },
          limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
        },
        required: ["wallet"],
        additionalProperties: false,
      },
    },
    {
      name: "get_transaction_summary",
      description: "Load one EVM transaction from RPC and explorer sources and summarize sent value, gas, and token movement.",
      inputSchema: {
        type: "object",
        properties: {
          txHash: { type: "string", description: "0x transaction hash" },
          network: { type: "string", enum: Object.keys(MCP_NETWORKS), default: "base" },
        },
        required: ["txHash"],
        additionalProperties: false,
      },
    },
    {
      name: "get_public_receipt",
      description: "Fetch a public TxReceipts receipt by deterministic receiptId.",
      inputSchema: {
        type: "object",
        properties: {
          receiptId: { type: "string", description: "TXR-NETWORK-HASH24 receipt id" },
        },
        required: ["receiptId"],
        additionalProperties: false,
      },
    },
    {
      name: "create_receipt",
      description: "Create a TxReceipts receipt through the API. Requires Authorization Bearer API key on the MCP request.",
      inputSchema: {
        type: "object",
        properties: {
          chainId: { type: "integer" },
          txHash: { type: "string" },
          ownerWallet: { type: "string" },
          idempotencyKey: { type: "string" },
          intent: {
            type: "object",
            properties: {
              type: { type: "string" },
              summary: { type: "string" },
            },
            required: ["type", "summary"],
            additionalProperties: true,
          },
        },
        required: ["chainId", "txHash", "ownerWallet", "intent"],
        additionalProperties: true,
      },
    },
  ];
}

async function callMcpTool(name, args, request, env) {
  if (name === "list_networks") {
    return mcpText({
      networks: Object.values(MCP_NETWORKS).map(network => ({
        ...network,
        networkCapabilities: mcpNetworkCapabilities(networkCapabilitiesForReceipt({ network: network.id, chainId: network.chainId })),
      })),
      security: {
        readOnly: true,
        signsTransactions: false,
        sendsTransfers: false,
        requestsApprovals: false,
      },
    });
  }
  if (name === "get_wallet_activity") {
    const wallet = normalizeOwnerWallet(args.wallet);
    const network = mcpNetwork(String(args.network || "base"));
    const capabilities = networkCapabilitiesForReceipt({ network: network.id, chainId: network.chainId });
    const limit = Math.max(1, Math.min(50, Number(args.limit || 20)));
    const [transactions, tokenTransfers] = await Promise.all([
      fetchExplorerJson(network, `/api/v2/addresses/${wallet}/transactions`, { items_count: limit }),
      fetchExplorerJson(network, `/api/v2/addresses/${wallet}/token-transfers`, { items_count: limit }),
    ]);
    return mcpText({
      wallet,
      network: network.name,
      totals: {
        transactions: Array.isArray(transactions.items) ? transactions.items.length : 0,
        tokenTransfers: Array.isArray(tokenTransfers.items) ? tokenTransfers.items.length : 0,
      },
      networkCapabilities: mcpNetworkCapabilities(capabilities),
      transactions: (transactions.items || []).slice(0, limit).map(item => summarizeWalletTx(item, wallet, network)),
      tokenTransfers: (tokenTransfers.items || []).slice(0, limit).map(item => summarizeWalletTransfer(item, wallet)),
    });
  }
  if (name === "get_transaction_summary") {
    const txHash = normalizeTxHash(args.txHash);
    const network = mcpNetwork(String(args.network || "base"));
    const capabilities = networkCapabilitiesForReceipt({ network: network.id, chainId: network.chainId });
    const [tx, receipt, transferPayload] = await Promise.all([
      rpcJson(network.rpcUrl, "eth_getTransactionByHash", [txHash]),
      rpcJson(network.rpcUrl, "eth_getTransactionReceipt", [txHash]),
      fetchExplorerJson(network, `/api/v2/transactions/${txHash}/token-transfers`).catch(() => ({ items: [] })),
    ]);
    if (!tx || !receipt) throw httpError(404, `Transaction not found on ${network.name}.`);
    const block = receipt.blockNumber ? await rpcJson(network.rpcUrl, "eth_getBlockByNumber", [receipt.blockNumber, false]) : null;
    const gasFeeWei = hexToBigInt(receipt.gasUsed) * hexToBigInt(receipt.effectiveGasPrice || tx.gasPrice);
    return mcpText({
      network: network.name,
      chainId: network.chainId,
      txHash,
      status: receipt.status === "0x1" ? "verified" : "failed",
      blockNumber: receipt.blockNumber ? Number.parseInt(receipt.blockNumber, 16) : null,
      timestamp: block?.timestamp ? new Date(Number(hexToBigInt(block.timestamp)) * 1000).toISOString() : null,
      from: tx.from,
      to: tx.to || null,
      value: formatNativeAmount(tx.value, network.nativeSymbol),
      gasFee: formatNativeAmount(gasFeeWei, network.nativeSymbol),
      method: tx.input && tx.input !== "0x" ? tx.input.slice(0, 10) : "native transfer",
      networkCapabilities: mcpNetworkCapabilities(capabilities),
      tokenTransfers: (transferPayload.items || []).slice(0, 20).map(item => ({
        token: item.token?.symbol || item.token?.name || item.token_type || "TOKEN",
        amount: item.total?.value || null,
        decimals: item.total?.decimals || item.token?.decimals || null,
        from: item.from?.hash || null,
        to: item.to?.hash || null,
      })),
      explorerUrl: `${network.explorerUrl}/tx/${txHash}`,
    });
  }
  if (name === "get_public_receipt") {
    const receiptId = String(args.receiptId || "").toUpperCase();
    if (!/^TXR-[A-Z0-9]+-[A-F0-9]{24}$/.test(receiptId)) throw httpError(400, "Invalid receiptId.");
    return mcpText(await getPublicReceipt(env, receiptId));
  }
  if (name === "create_receipt") {
    const auth = request.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) throw httpError(401, "Missing Authorization Bearer API key on MCP request.");
    const url = new URL(request.url);
    const response = await fetch(`${url.origin}/v1/receipts`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        ...(args.idempotencyKey ? { "Idempotency-Key": String(args.idempotencyKey) } : {}),
      },
      body: JSON.stringify(args),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError(response.status, payload.error || `Receipt API returned HTTP ${response.status}`);
    return mcpText(payload);
  }
  throw httpError(404, `Unknown MCP tool: ${name}`);
}

function mcpText(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function mcpResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function mcpError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function mcpNetwork(networkId) {
  const network = MCP_NETWORKS[String(networkId || "base")];
  if (!network) throw httpError(400, `Unsupported network: ${networkId}`);
  return network;
}

async function fetchExplorerJson(network, path, params = {}) {
  const url = new URL(path, network.blockscoutUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw httpError(response.status, `${network.name} explorer returned HTTP ${response.status}`);
  return response.json();
}

async function rpcJson(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!response.ok) throw httpError(response.status, `RPC returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw httpError(502, payload.error.message || "RPC request failed.");
  return payload.result;
}

function summarizeWalletTx(item, wallet, network) {
  const from = String(item.from?.hash || "").toLowerCase();
  const to = String(item.to?.hash || "").toLowerCase();
  const direction = to === wallet && from !== wallet ? "incoming" : from === wallet ? "outgoing" : "other";
  return {
    txHash: item.hash,
    timestamp: item.timestamp || null,
    direction,
    method: item.method || item.decoded_input?.method_call || "transaction",
    value: item.value && item.value !== "0" ? formatNativeAmount(item.value, network.nativeSymbol) : null,
    from: item.from?.hash || null,
    to: item.to?.hash || null,
    status: item.status || item.result || "ok",
  };
}

function summarizeWalletTransfer(item, wallet) {
  const from = String(item.from?.hash || "").toLowerCase();
  const to = String(item.to?.hash || "").toLowerCase();
  const direction = to === wallet && from !== wallet ? "incoming" : from === wallet ? "outgoing" : "other";
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

function formatNativeAmount(value, symbol) {
  const amount = hexToBigInt(value);
  const base = 10n ** 18n;
  const whole = amount / base;
  const fraction = (amount % base).toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""} ${symbol}`;
}

async function answerAccountingQuestion(request, env) {
  if (!env.AI_API_KEY) throw httpError(503, "AI_API_KEY is not configured.");
  const project = await maybeProject(request, env);
  const usage = project ? await prepareQuotaCharge(env, project.id) : null;
  const body = await readJson(request);
  const question = String(body.question || "").trim().slice(0, 500);
  if (!question) throw httpError(400, "Missing question.");
  const context = compactAiContext(body.context || {});
  const capabilities = context.networkCapabilities || networkCapabilitiesForReceipt({
    network: context.network,
    chainId: context.chainId,
  });
  const route = detectQuestionRoute(question, context);
  if (isAmbiguousQuestion(question, context)) {
    return misunderstandingAnswer(
      "Clarify the target transaction or load wallet activity before asking again.",
      "The current question is ambiguous or the loaded wallet data is too small to support a precise answer.",
      project ? {
        counted: false,
        amount: 0,
        reason: "guarded ambiguous question",
        remaining: usage?.remaining,
      } : {
        counted: false,
        amount: 0,
        reason: "guarded public ambiguous question",
      },
      route,
    );
  }
  if (isCurrentBalanceQuestion(question) && !hasExplicitBalanceSnapshot(context)) {
    return misunderstandingAnswer(
      "Load a direct wallet token balance snapshot for the selected network and token.",
      "The provided context contains transaction rows, but no explicit live balance snapshot for this wallet or token.",
      project ? {
        counted: false,
        amount: 0,
        reason: "guarded current-balance question without balance snapshot",
        remaining: usage?.remaining,
      } : {
        counted: false,
        amount: 0,
        reason: "guarded public current-balance question without balance snapshot",
      },
      route,
    );
  }
  const baseUrl = (env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = env.AI_MODEL || "gpt-4.1";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content: [
            "You are TxReceipts Accounting AI.",
            "Always answer in English.",
            "Answer only from the provided compact accounting JSON.",
            "Treat context.balances as the authoritative live balance snapshot for the connected wallet on the selected network.",
            "Use context.networkCapabilities to explain network-specific behavior such as gas token, preferred stablecoin, MCP readiness, Base Account compatibility, and x402 readiness.",
            "Only answer questions about the provided network's wallet activity, transactions, fees, token movements, categories, exports, receipts, and reconciliation.",
            "If the question is outside that scope, say it is out of scope.",
            "If the question is ambiguous or you cannot map it to specific wallet transactions, balances, or selected records, say you did not understand the question from the loaded wallet data.",
            "When context.selectedTx, context.selectedReceipt, or context.selectedLedgerRow is present, treat the question as transaction-scoped unless the user explicitly asks wallet-wide or time-window totals.",
            "Use selectedReceipt and selectedLedgerRow first for transaction-specific answers, then use rows and analysis for broader wallet questions.",
            "Use context.balances first for current token holdings, then use rows and analysis for historical activity.",
            "Prefer context.analysis when ranking, sorting, or summarizing top transactions in time windows.",
            "Do not fall back to a generic wallet summary unless it directly answers the question.",
            "Never infer a current wallet or token balance by netting historical transfers, rows, or partial activity.",
            "Only answer a current balance question when the context includes an explicit balance snapshot field; otherwise say the current balance is unavailable from the loaded data.",
            "Do not invent balances, tax treatment, dates, or missing fees.",
            "Keep the answer under 120 words.",
            "Use a concise accounting report style.",
            "Format the answer as 3 short parts when possible: Answer, Evidence, Missing.",
            "When balance data exists, cite the exact token symbol, amount, network, and snapshot time in Evidence.",
            "Evidence must cite concrete context fields such as tx hash, status, method, sent, received, gas, direction, category, feeValue, gasUsed, gasPrice, or timestamps.",
            "If the data is incomplete, say Confidence: low in the Missing part.",
            "If data is missing, say exactly what is missing and what the user should load.",
            capabilities?.network === "base" ? "For Base-specific gas answers, state that Base gas is paid in ETH." : "",
            capabilities?.network === "base" ? "For Base verification answers, state that verification uses Base transaction hash, block timestamp, and onchain token movements." : "",
            capabilities?.network === "base" ? "For accounting export answers, mention that the output is a pre-accounting record and not an official invoice or e-ledger filing." : "",
            capabilities?.network === "base" ? "For MCP answers, mention that Base MCP can be used for wallet activity and transaction history, while TxReceipts stays read-only and does not sign, send, swap, or request approvals." : "",
            routingNote(route),
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({ question, context }),
        },
      ],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status, payload.error?.message || "AI provider request failed.");
  const answer = payload.choices?.[0]?.message?.content || "";
  if (project && usage && !usage.usesFreeAllowance) {
    await env.DB.prepare(
      `INSERT INTO credit_ledger (id, project_id, source, delta, balance_after, reason)
       VALUES (?, ?, 'ai_usage', -1, ?, 'paid AI accounting answer')`
    ).bind(`cl_${crypto.randomUUID()}`, project.id, usage.paidBalanceAfter).run();
  }
  return {
    answer: String(answer).trim().slice(0, 1200) || "AI could not prepare an answer from the provided accounting context.",
    source: "ai",
    model,
    route,
    usage: project ? {
      counted: true,
      amount: 1,
      reason: usage.usesFreeAllowance ? "free monthly API allowance" : "paid AI accounting answer",
      remaining: usage.remaining,
    } : {
      counted: false,
      amount: 0,
      reason: "public panel request",
    },
  };
}

function compactAiContext(context) {
  return {
    network: String(context.network || "").slice(0, 80),
    chainId: Number(context.chainId || 0) || null,
    scope: String(context.scope || "").slice(0, 160),
    wallet: String(context.wallet || "").slice(0, 80),
    selectedTx: String(context.selectedTx || "").slice(0, 100),
    balances: context.balances || null,
    networkCapabilities: context.networkCapabilities || null,
    report: context.report || {},
    analysis: context.analysis || {},
    selectedReceipt: context.selectedReceipt || null,
    selectedLedgerRow: context.selectedLedgerRow || null,
    rows: Array.isArray(context.rows) ? context.rows.slice(0, 40) : [],
  };
}

function isCurrentBalanceQuestion(question) {
  return /(wallet|cüzdan).*(balance|bakiye)|\b(balance|bakiye)\b|kaç\s+usdc|how much usdc do i have|current\s+(usdc\s+)?balance/i.test(String(question || ""));
}

function isAmbiguousQuestion(question, context) {
  const text = String(question || "").trim();
  if (!text) return true;
  if (text.length < 6) return true;
  const hasSelection = Boolean(context?.selectedTx || context?.selectedReceipt || context?.selectedLedgerRow);
  if (!hasSelection && /^(this|that|it|bu|şu|o|onu|bunu|nedir|ne dersin)\b/i.test(text)) return true;
  if (!hasUsableAccountingContext(context)) return true;
  return false;
}

function hasUsableAccountingContext(context) {
  if (!context) return false;
  if (context.selectedTx || context.selectedReceipt || context.selectedLedgerRow) return true;
  if (Array.isArray(context.rows) && context.rows.length > 0) return true;
  if (context.balances?.native || (Array.isArray(context.balances?.tokens) && context.balances.tokens.length > 0)) return true;
  return Number(context.report?.totalRecords || 0) > 0;
}

function misunderstandingAnswer(reason, evidence, usage, route) {
  return {
    answer: [
      "Answer: I could not determine a reliable answer from the loaded wallet transactions and balance snapshot.",
      `Evidence: ${evidence}`,
      `Missing: ${reason} Confidence: low.`,
    ].join("\n\n"),
    source: "ai-guard",
    model: "question-guard",
    route,
    usage,
  };
}

function hasExplicitBalanceSnapshot(context) {
  const report = context?.report || {};
  const analysis = context?.analysis || {};
  const selectedReceipt = context?.selectedReceipt || {};
  const selectedLedgerRow = context?.selectedLedgerRow || {};
  const candidateKeys = [
    "balance",
    "balances",
    "currentBalance",
    "currentBalances",
    "tokenBalance",
    "tokenBalances",
    "portfolio",
    "holdings",
  ];
  const sources = [context, report, analysis, selectedReceipt, selectedLedgerRow];
  return sources.some(source => source && candidateKeys.some(key => source[key] !== undefined && source[key] !== null));
}

async function createProject(request, env) {
  const body = await readJson(request);
  return createProjectRecord(env, body);
}

async function createFreeProject(request, env) {
  const body = await readJson(request);
  const billingWallet = normalizeOwnerWallet(body.billingWallet);
  const existing = await env.DB.prepare(
    `SELECT p.id AS project_id
     FROM billing_wallets bw
     JOIN projects p ON p.id = bw.project_id
     WHERE bw.wallet_address = ? AND bw.status = 'active' AND p.status = 'active'
     LIMIT 1`
  ).bind(billingWallet).first();
  if (existing) throw httpError(409, "This wallet already has a free API key.");

  const created = await createProjectRecord(env, {
    name: body.name || `Free API ${billingWallet.slice(2, 8)}`,
    billingWallet,
    billingWalletLabel: "Connected wallet",
  });
  return {
    ...created,
    freeAllowance: FREE_API_REQUESTS,
    totalAvailable: FREE_API_REQUESTS,
    paidBalance: 0,
    unit: "api_requests",
    signup: "free_wallet_trial",
  };
}

async function createProjectRecord(env, body = {}) {
  const projectId = body.projectId || `project_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(projectId)) throw httpError(400, "Invalid projectId.");
  const name = String(body.name || projectId).slice(0, 120);
  const apiKey = `txr_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const apiKeyHash = await sha256(apiKey);
  const billingWallet = body.billingWallet ? normalizeAddress(body.billingWallet) : null;
  if (billingWallet && !/^0x[a-f0-9]{40}$/.test(billingWallet)) throw httpError(400, "Invalid billingWallet.");

  const statements = [
    env.DB.prepare("INSERT INTO projects (id, name, api_key_hash) VALUES (?, ?, ?)")
      .bind(projectId, name, apiKeyHash),
  ];
  if (billingWallet) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO billing_wallets (project_id, wallet_address, label, status, verified_at) VALUES (?, ?, ?, 'active', ?)"
      ).bind(projectId, billingWallet, String(body.billingWalletLabel || "Billing wallet").slice(0, 80), new Date().toISOString()),
    );
  }
  await env.DB.batch(statements);
  return { projectId, apiKey, billingWallet };
}

async function createTopUp(request, env, project) {
  const body = await readJson(request);
  const validation = validateTopUpIntent(body);
  if (!validation.accepted) throw httpError(400, validation.reasons.join(","));
  const paymentId = `pay_${crypto.randomUUID().replaceAll("-", "")}`;
  const receivingAddress = normalizeAddress(env.TREASURY_ADDRESS);
  if (!/^0x[a-f0-9]{40}$/.test(receivingAddress)) throw httpError(500, "Treasury address is not configured.");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const billingWallet = body.billingWallet ? normalizeAddress(body.billingWallet) : null;

  await env.DB.prepare(
    `INSERT INTO topups (id, project_id, amount_usdc, credit_amount, billing_wallet, receiving_address, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'waiting_for_payment', ?)`
  ).bind(paymentId, project.id, body.amountUsdc, validation.creditAmount, billingWallet, receivingAddress, expiresAt).run();

  return {
    paymentId,
    status: "waiting_for_payment",
    network: "base",
    chainId: BASE_CHAIN_ID,
    token: { symbol: "USDC", address: BASE_USDC_ADDRESS, decimals: 6 },
    amountUsdc: body.amountUsdc,
    creditAmount: validation.creditAmount,
    receivingAddress,
    billingWallet,
    expiresAt,
  };
}

async function getTopUp(env, projectId, paymentId) {
  const row = await env.DB.prepare("SELECT * FROM topups WHERE id = ? AND project_id = ?").bind(paymentId, projectId).first();
  if (!row) throw httpError(404, "Top-up not found.");
  return mapTopUp(row);
}

async function reconcileTopUpTransfer(request, env, project, paymentId) {
  const body = await readJson(request);
  const txHash = normalizeTxHash(body.txHash);
  const topUp = await env.DB.prepare("SELECT * FROM topups WHERE id = ? AND project_id = ?").bind(paymentId, project.id).first();
  if (!topUp) throw httpError(404, "Top-up not found.");
  if (topUp.status !== "waiting_for_payment") {
    return { topUp: mapTopUp(topUp), reconcile: { accepted: true, reasons: ["already_processed"], txHash: topUp.tx_hash || txHash } };
  }

  const transfer = await fetchBaseUsdcTransferByTxHash(txHash);
  const result = await creditSpecificTopUp(env, project.id, topUp, transfer);
  const updated = await env.DB.prepare("SELECT * FROM topups WHERE id = ? AND project_id = ?").bind(paymentId, project.id).first();
  return {
    topUp: mapTopUp(updated || topUp),
    reconcile: {
      accepted: result.accepted,
      reasons: result.reasons,
      txHash,
      amountUsdc: result.amountUsdc,
      creditAmount: result.creditAmount,
      confirmations: Number(transfer.confirmations || 0),
    },
  };
}

async function listTopUps(env, projectId) {
  const rows = await env.DB.prepare(
    `SELECT * FROM topups
     WHERE project_id = ?
     ORDER BY created_at DESC
     LIMIT 20`
  ).bind(projectId).all();
  const items = (rows.results || []).map(mapTopUp);
  return {
    items,
    pendingCount: items.filter(item => item.status === "waiting_for_payment").length,
    creditedCount: items.filter(item => item.status === "credited").length,
  };
}

async function projectCredits(env, projectId) {
  const usage = await projectUsageSnapshot(env, projectId);
  return {
    projectId,
    balance: usage.paidBalance,
    overdraftLimit: CREDIT_OVERDRAFT_LIMIT,
    receipts: usage.receipts,
    freeAllowance: usage.freeAllowance,
    freeUsed: usage.freeUsed,
    freeRemaining: usage.freeRemaining,
    paidBalance: usage.paidBalance,
    totalAvailable: usage.totalAvailable,
    unit: "api_requests",
  };
}

async function createReceipt(request, env, project) {
  const body = await readJson(request);
  const chainId = normalizeChainId(body.chainId);
  const network = networkCodeForChainId(chainId);
  if (chainId !== BASE_CHAIN_ID) throw httpError(400, "Only Base receipts are billable in the launch API.");
  const txHash = normalizeTxHash(body.txHash);
  const ownerWallet = normalizeOwnerWallet(body.ownerWallet || body.user);
  const receiptId = await generateReceiptId({ chainId, network, txHash, ownerWallet });
  const idempotencyKey = request.headers.get("Idempotency-Key")
    || body.idempotencyKey
    || `${project.id}:${chainId}:${txHash}:${ownerWallet}`;

  const existing = await env.DB.prepare(
    "SELECT * FROM receipts WHERE project_id = ? AND (id = ? OR idempotency_key = ? OR (chain_id = ? AND tx_hash = ? AND owner_wallet = ?)) LIMIT 1"
  ).bind(project.id, receiptId, idempotencyKey, chainId, txHash, ownerWallet).first();
  if (existing) {
    const usage = await projectUsageSnapshot(env, project.id);
    return mapReceiptResponse(existing, {
      remaining: usage.totalAvailable,
      counted: false,
      amount: 0,
      reason: "duplicate chain + tx hash + owner wallet",
    }, env);
  }

  const usage = await projectUsageSnapshot(env, project.id);
  const usesFreeAllowance = usage.freeRemaining > 0;
  if (!usesFreeAllowance && usage.paidBalance < 1) {
    throw httpError(402, "Free API allowance is exhausted and paid request balance is empty.");
  }
  const balanceAfter = usesFreeAllowance ? usage.paidBalance : usage.paidBalance - 1;
  const revisionId = `rr_${crypto.randomUUID().replaceAll("-", "")}`;
  const createdAt = new Date().toISOString();
  const direction = String(body.direction || "unknown").slice(0, 32);
  const category = String(body.category || body.intent?.type || "unknown").slice(0, 64);
  const verificationStatus = "verified";
  const memo = body.memo ? String(body.memo).slice(0, 500) : null;
  const accountingNote = body.accountingNote ? String(body.accountingNote).slice(0, 1000) : null;
  const businessExpense = body.businessExpense ? 1 : 0;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO receipts
       (id, project_id, chain_id, network, tx_hash, owner_wallet, direction, category, status, verification_status, memo, accounting_note, business_expense, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?, ?, ?, ?, ?)`
     ).bind(receiptId, project.id, chainId, network.toLowerCase(), txHash, ownerWallet, direction, category, verificationStatus, memo, accountingNote, businessExpense, idempotencyKey, createdAt, createdAt),
    ...(
      usesFreeAllowance
        ? []
        : [env.DB.prepare(
          `INSERT INTO credit_ledger (id, project_id, source, receipt_id, delta, balance_after, reason)
           VALUES (?, ?, 'receipt_usage', ?, -1, ?, 'verified API request usage')`
        ).bind(`cl_${crypto.randomUUID()}`, project.id, receiptId, balanceAfter)]
    ),
    env.DB.prepare(
      `INSERT INTO receipt_revisions (id, receipt_id, version, changed_at, changed_by, changes_json)
       VALUES (?, ?, 1, ?, ?, ?)`
    ).bind(revisionId, receiptId, createdAt, project.id, JSON.stringify({
      receiptId,
      chainId,
      network: network.toLowerCase(),
      txHash,
      ownerWallet,
      direction,
      category,
      status: "verified",
      verificationStatus,
    })),
  ]);

  const created = await env.DB.prepare("SELECT * FROM receipts WHERE id = ? LIMIT 1").bind(receiptId).first();
  return mapReceiptResponse(created, {
    remaining: Math.max(usage.freeRemaining - 1, 0) + balanceAfter,
    counted: true,
    amount: 1,
    reason: usesFreeAllowance ? "free monthly API allowance" : "verified API request usage",
  }, env);
}

async function getReceipt(env, projectId, receiptId) {
  const row = await env.DB.prepare("SELECT * FROM receipts WHERE id = ? AND project_id = ? LIMIT 1").bind(String(receiptId || "").toUpperCase(), projectId).first();
  if (!row) throw httpError(404, "Receipt not found.");
  const usage = await projectUsageSnapshot(env, projectId);
  return mapReceiptResponse(row, {
    remaining: usage.totalAvailable,
    counted: false,
    amount: 0,
    reason: "existing receipt",
  }, env);
}

async function getPublicReceipt(env, receiptId) {
  const row = await env.DB.prepare("SELECT * FROM receipts WHERE id = ? LIMIT 1").bind(String(receiptId || "").toUpperCase()).first();
  if (!row) throw httpError(404, "Receipt not found.");
  return mapPublicReceipt(row, env);
}

async function updateReceipt(request, env, project, receiptId) {
  const body = await readJson(request);
  const existing = await env.DB.prepare("SELECT * FROM receipts WHERE id = ? AND project_id = ? LIMIT 1").bind(String(receiptId || "").toUpperCase(), project.id).first();
  if (!existing) throw httpError(404, "Receipt not found.");

  const changes = {};
  for (const field of RECEIPT_EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      changes[field] = body[field];
    }
  }
  if (Object.keys(changes).length === 0) throw httpError(400, "No supported receipt revision fields provided.");

  const nextCategory = Object.prototype.hasOwnProperty.call(changes, "category")
    ? String(changes.category || existing.category || "unknown").slice(0, 64)
    : existing.category;
  const nextMemo = Object.prototype.hasOwnProperty.call(changes, "memo")
    ? String(changes.memo || "").slice(0, 500)
    : existing.memo;
  const nextAccountingNote = Object.prototype.hasOwnProperty.call(changes, "accountingNote")
    ? String(changes.accountingNote || "").slice(0, 1000)
    : existing.accounting_note;
  const nextBusinessExpense = Object.prototype.hasOwnProperty.call(changes, "businessExpense")
    ? Number(Boolean(changes.businessExpense))
    : Number(existing.business_expense || 0);
  const nextUpdatedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE receipts SET category = ?, memo = ?, accounting_note = ?, business_expense = ?, updated_at = ? WHERE id = ? AND project_id = ?"
    ).bind(nextCategory, nextMemo, nextAccountingNote, nextBusinessExpense, nextUpdatedAt, existing.id, project.id),
    env.DB.prepare(
      `INSERT INTO receipt_revisions (id, receipt_id, version, changed_at, changed_by, changes_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      `rr_${crypto.randomUUID().replaceAll("-", "")}`,
      existing.id,
      Number(await nextReceiptRevisionVersion(env, existing.id)),
      nextUpdatedAt,
      project.id,
      JSON.stringify(changes),
    ),
  ]);

  const updated = await env.DB.prepare("SELECT * FROM receipts WHERE id = ? AND project_id = ? LIMIT 1").bind(existing.id, project.id).first();
  const usage = await projectUsageSnapshot(env, project.id);
  return mapReceiptResponse(updated, {
    remaining: usage.totalAvailable,
    counted: false,
    amount: 0,
    reason: "receipt revision stored",
  }, env);
}

async function scanBaseUsdcTransfers(env) {
  const treasury = normalizeAddress(env.TREASURY_ADDRESS);
  if (!/^0x[a-f0-9]{40}$/.test(treasury)) return;
  const url = `https://base.blockscout.com/api/v2/addresses/${treasury}/token-transfers?type=ERC-20`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Blockscout returned HTTP ${response.status}`);
  const payload = await response.json();
  const items = Array.isArray(payload.items) ? payload.items.slice(0, 50).reverse() : [];
  for (const item of items) {
    await processExplorerTransfer(env, item);
  }
}

export async function processExplorerTransfer(env, item) {
  const txHash = String(item.transaction_hash || "").toLowerCase();
  if (!txHash) return { accepted: false, reasons: ["missing_tx_hash"] };
  const existing = await env.DB.prepare("SELECT tx_hash FROM payment_ledger WHERE tx_hash = ?").bind(txHash).first();
  if (existing) return { accepted: false, reasons: ["duplicate_tx_hash"] };

  const transfer = {
    chainId: BASE_CHAIN_ID,
    tokenAddress: item.token?.address_hash || "",
    fromAddress: item.from?.hash || "",
    toAddress: item.to?.hash || "",
    amountUsdc: formatExplorerTokenAmount(item),
    txHash,
    confirmations: REQUIRED_CONFIRMATIONS,
  };
  const sender = normalizeAddress(transfer.fromAddress);
  const walletRows = await env.DB.prepare(
    "SELECT project_id, wallet_address FROM billing_wallets WHERE wallet_address = ? AND status = 'active'"
  ).bind(sender).all();
  const billingWallets = (walletRows.results || []).map(row => row.wallet_address);
  const credited = await env.DB.prepare("SELECT tx_hash FROM payment_ledger WHERE status = 'credited'").all();
  const validation = validateObservedTransfer(transfer, {
    treasuryAddress: env.TREASURY_ADDRESS,
    billingWallets,
    creditedTxHashes: (credited.results || []).map(row => row.tx_hash),
  });
  const projectId = walletRows.results?.[0]?.project_id || null;

  if (!validation.accepted || !projectId) {
    await recordRejectedPayment(env, transfer, projectId, validation.reasons.join(","));
    return validation;
  }

  const topup = await matchWaitingTopUp(env, projectId, sender, validation.amountUsdc);
  if (!topup) {
    await recordRejectedPayment(env, transfer, projectId, "no_matching_topup_intent");
    return { accepted: false, reasons: ["no_matching_topup_intent"], amountUsdc: validation.amountUsdc, creditAmount: 0 };
  }

  const balanceAfter = await getBalance(env, projectId) + validation.creditAmount;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO payment_ledger (id, project_id, chain_id, token_address, from_address, to_address, tx_hash, amount_usdc, status, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'credited', ?)`
    ).bind(`pl_${crypto.randomUUID()}`, projectId, BASE_CHAIN_ID, BASE_USDC_ADDRESS, sender, normalizeAddress(transfer.toAddress), txHash, validation.amountUsdc, new Date().toISOString()),
    env.DB.prepare("UPDATE topups SET status = 'credited', tx_hash = ?, credited_at = ? WHERE id = ?")
      .bind(txHash, new Date().toISOString(), topup.id),
    env.DB.prepare(
      `INSERT INTO credit_ledger (id, project_id, source, payment_id, delta, balance_after, reason)
       VALUES (?, ?, 'usdc_topup', ?, ?, ?, 'Base USDC top-up confirmed')`
    ).bind(`cl_${crypto.randomUUID()}`, projectId, topup.id, validation.creditAmount, balanceAfter),
  ]);
  return validation;
}

async function creditSpecificTopUp(env, projectId, topUp, transfer) {
  const credited = await env.DB.prepare("SELECT tx_hash FROM payment_ledger WHERE status = 'credited' AND tx_hash = ?").bind(transfer.txHash).first();
  const validation = validateObservedTransfer(transfer, {
    treasuryAddress: env.TREASURY_ADDRESS,
    billingWallets: topUp.billing_wallet ? [topUp.billing_wallet] : [],
    creditedTxHashes: credited ? [credited.tx_hash] : [],
  });
  const reasons = [...validation.reasons];
  if (!topUp.billing_wallet) reasons.push("missing_billing_wallet");
  if (validation.accepted && String(validation.amountUsdc) !== String(topUp.amount_usdc)) reasons.push("topup_amount_mismatch");
  if (new Date(topUp.expires_at).getTime() <= Date.now()) reasons.push("topup_expired");
  if (reasons.length > 0) {
    return {
      accepted: false,
      reasons,
      amountUsdc: validation.amountUsdc,
      creditAmount: 0,
    };
  }

  const balanceAfter = await getBalance(env, projectId) + validation.creditAmount;
  const creditedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO payment_ledger (id, project_id, chain_id, token_address, from_address, to_address, tx_hash, amount_usdc, status, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'credited', ?)`
    ).bind(
      `pl_${crypto.randomUUID()}`,
      projectId,
      BASE_CHAIN_ID,
      BASE_USDC_ADDRESS,
      normalizeAddress(transfer.fromAddress),
      normalizeAddress(transfer.toAddress),
      transfer.txHash,
      validation.amountUsdc,
      creditedAt,
    ),
    env.DB.prepare("UPDATE topups SET status = 'credited', tx_hash = ?, credited_at = ? WHERE id = ? AND project_id = ?")
      .bind(transfer.txHash, creditedAt, topUp.id, projectId),
    env.DB.prepare(
      `INSERT INTO credit_ledger (id, project_id, source, payment_id, delta, balance_after, reason)
       VALUES (?, ?, 'usdc_topup', ?, ?, ?, 'Base USDC top-up confirmed from wallet panel')`
    ).bind(`cl_${crypto.randomUUID()}`, projectId, topUp.id, validation.creditAmount, balanceAfter),
  ]);
  return validation;
}

async function fetchBaseUsdcTransferByTxHash(txHash) {
  const rpcUrl = MCP_NETWORKS.base.rpcUrl;
  const [receipt, latestBlock] = await Promise.all([
    rpcJson(rpcUrl, "eth_getTransactionReceipt", [txHash]),
    rpcJson(rpcUrl, "eth_blockNumber", []),
  ]);
  if (!receipt) throw httpError(404, "Transaction receipt not found on Base.");
  const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
  const transferLog = logs.find(log => (
    normalizeAddress(log.address) === BASE_USDC_ADDRESS
    && String(log.topics?.[0] || "").toLowerCase() === ERC20_TRANSFER_TOPIC
    && Array.isArray(log.topics)
    && log.topics.length >= 3
  ));
  if (!transferLog) throw httpError(404, "No Base USDC transfer found in this transaction.");

  const blockNumber = Number(hexToBigInt(receipt.blockNumber || "0x0"));
  const latest = Number(hexToBigInt(latestBlock || "0x0"));
  return {
    chainId: BASE_CHAIN_ID,
    tokenAddress: BASE_USDC_ADDRESS,
    fromAddress: topicToAddress(transferLog.topics[1]),
    toAddress: topicToAddress(transferLog.topics[2]),
    amountUsdc: formatUsdcUnits(hexToBigInt(transferLog.data || "0x0")),
    txHash,
    confirmations: blockNumber > 0 ? Math.max(latest - blockNumber + 1, 0) : 0,
  };
}

function formatExplorerTokenAmount(item) {
  const value = BigInt(item.total?.value || "0");
  const decimals = BigInt(item.total?.decimals || item.token?.decimals || "6");
  const base = 10n ** decimals;
  const whole = value / base;
  const fraction = (value % base).toString().padStart(Number(decimals), "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

async function matchWaitingTopUp(env, projectId, wallet, amountUsdc) {
  return env.DB.prepare(
    `SELECT * FROM topups
     WHERE project_id = ? AND status = 'waiting_for_payment' AND billing_wallet = ? AND amount_usdc = ? AND expires_at > ?
     ORDER BY created_at ASC LIMIT 1`
  ).bind(projectId, wallet, amountUsdc, new Date().toISOString()).first();
}

async function recordRejectedPayment(env, transfer, projectId, reason) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO payment_ledger
     (id, project_id, chain_id, token_address, from_address, to_address, tx_hash, amount_usdc, status, rejection_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rejected', ?)`
  ).bind(
    `pl_${crypto.randomUUID()}`,
    projectId,
    Number(transfer.chainId || BASE_CHAIN_ID),
    normalizeAddress(transfer.tokenAddress),
    normalizeAddress(transfer.fromAddress),
    normalizeAddress(transfer.toAddress),
    String(transfer.txHash || "").toLowerCase(),
    transfer.amountUsdc || "0",
    reason,
  ).run();
}

async function requireProject(request, env) {
  const apiKey = readBearerToken(request);
  if (!apiKey) throw httpError(401, "Missing API key.");
  const project = await projectForApiKey(env, apiKey);
  if (!project) throw httpError(401, "Invalid API key.");
  return project;
}

async function maybeProject(request, env) {
  const apiKey = readBearerToken(request);
  if (!apiKey) return null;
  const project = await projectForApiKey(env, apiKey);
  if (!project) throw httpError(401, "Invalid API key.");
  return project;
}

async function ensureReceiptSchema(env) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const columns = await env.DB.prepare("PRAGMA table_info(receipts)").all();
      const existingColumns = new Set((columns.results || []).map(row => row.name));
      const statements = [];
      const missingColumns = [
        ["network", "TEXT"],
        ["owner_wallet", "TEXT"],
        ["direction", "TEXT"],
        ["category", "TEXT"],
        ["verification_status", "TEXT"],
        ["memo", "TEXT"],
        ["accounting_note", "TEXT"],
        ["business_expense", "INTEGER NOT NULL DEFAULT 0"],
        ["updated_at", "TEXT"],
      ];
      for (const [name, definition] of missingColumns) {
        if (!existingColumns.has(name)) {
          statements.push(env.DB.prepare(`ALTER TABLE receipts ADD COLUMN ${name} ${definition}`));
        }
      }
      statements.push(
        env.DB.prepare(
          `CREATE TABLE IF NOT EXISTS receipt_revisions (
            id TEXT PRIMARY KEY,
            receipt_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            changed_at TEXT NOT NULL,
            changed_by TEXT,
            changes_json TEXT NOT NULL,
            FOREIGN KEY (receipt_id) REFERENCES receipts(id)
          )`
        ),
      );
      statements.push(
        env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS receipts_chain_tx_owner_unique ON receipts(chain_id, tx_hash, owner_wallet)")
      );
      statements.push(
        env.DB.prepare("CREATE INDEX IF NOT EXISTS receipt_revisions_receipt_id_idx ON receipt_revisions(receipt_id, version)")
      );
      if (statements.length > 0) await env.DB.batch(statements);
    })().catch(error => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

async function requireAdmin(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) throw httpError(401, "Invalid admin token.");
}

async function getBalance(env, projectId) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(delta), 0) AS balance FROM credit_ledger WHERE project_id = ?"
  ).bind(projectId).first();
  return Number(row?.balance || 0);
}

async function prepareQuotaCharge(env, projectId, amount = 1) {
  const usage = await projectUsageSnapshot(env, projectId);
  const usesFreeAllowance = usage.freeRemaining >= amount;
  if (!usesFreeAllowance && usage.paidBalance < amount) {
    throw httpError(402, "Free API allowance is exhausted and paid request balance is empty.");
  }
  const paidBalanceAfter = usesFreeAllowance ? usage.paidBalance : usage.paidBalance - amount;
  return {
    usesFreeAllowance,
    paidBalanceAfter,
    remaining: Math.max(usage.freeRemaining - amount, 0) + paidBalanceAfter,
  };
}

async function projectForApiKey(env, apiKey) {
  const hash = await sha256(apiKey);
  return env.DB.prepare("SELECT * FROM projects WHERE api_key_hash = ? AND status = 'active'").bind(hash).first();
}

function readBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

async function getReceiptCount(env, projectId) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS receipts FROM receipts WHERE project_id = ?"
  ).bind(projectId).first();
  return Number(row?.receipts || 0);
}

async function projectUsageSnapshot(env, projectId) {
  const [paidBalance, receipts] = await Promise.all([
    getBalance(env, projectId),
    getReceiptCount(env, projectId),
  ]);
  const freeAllowance = FREE_API_REQUESTS;
  const freeUsed = Math.min(receipts, freeAllowance);
  const freeRemaining = Math.max(freeAllowance - freeUsed, 0);
  const totalAvailable = freeRemaining + Math.max(paidBalance, 0);
  return {
    paidBalance,
    receipts,
    freeAllowance,
    freeUsed,
    freeRemaining,
    totalAvailable,
  };
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function generateReceiptId({ chainId, network, txHash, ownerWallet }) {
  const source = `${String(chainId)}:${String(txHash).toLowerCase()}:${String(ownerWallet).toLowerCase()}`;
  const hash = (await sha256(source)).slice(0, 24).toUpperCase();
  return `TXR-${String(network).toUpperCase()}-${hash}`;
}

function normalizeChainId(value) {
  const chainId = Number(value);
  if (!Number.isInteger(chainId) || !CHAIN_NETWORK_CODE[chainId]) throw httpError(400, "Unsupported chainId.");
  return chainId;
}

function networkCodeForChainId(chainId) {
  const code = CHAIN_NETWORK_CODE[Number(chainId)];
  if (!code) throw httpError(400, "Unsupported chainId.");
  return code;
}

function normalizeTxHash(value) {
  const txHash = String(value || "").toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) throw httpError(400, "Invalid txHash.");
  return txHash;
}

function normalizeOwnerWallet(value) {
  const ownerWallet = normalizeAddress(value);
  if (!/^0x[a-f0-9]{40}$/.test(ownerWallet)) throw httpError(400, "Invalid ownerWallet.");
  return ownerWallet;
}

function topicToAddress(value) {
  const topic = String(value || "").toLowerCase().replace(/^0x/, "");
  if (topic.length < 40) throw httpError(400, "Invalid transfer topic.");
  return `0x${topic.slice(-40)}`;
}

function receiptUrl(receiptId, env) {
  const baseUrl = String(env.PUBLIC_APP_URL || RECEIPT_BASE_URL).replace(/\/+$/, "");
  return `${baseUrl}/r/${receiptId}`;
}

async function nextReceiptRevisionVersion(env, receiptId) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM receipt_revisions WHERE receipt_id = ?"
  ).bind(receiptId).first();
  return Number(row?.version || 1);
}

function mapPublicReceipt(row, env = {}) {
  const capabilities = networkCapabilitiesForReceipt({
    network: String(row.network || networkCodeForChainId(row.chain_id)).toLowerCase(),
    chainId: Number(row.chain_id),
  });
  return {
    receiptId: row.id,
    network: String(row.network || networkCodeForChainId(row.chain_id)).toLowerCase(),
    chainId: Number(row.chain_id),
    networkCapabilities: networkCapabilitiesSummary(capabilities),
    txHash: row.tx_hash,
    ownerWallet: row.owner_wallet,
    verificationStatus: row.verification_status || row.status,
    direction: row.direction || "unknown",
    category: row.category || "unknown",
    memo: row.memo || undefined,
    accountingNote: row.accounting_note || undefined,
    businessExpense: Boolean(row.business_expense),
    receiptUrl: receiptUrl(row.id, env),
  };
}

function mapReceiptResponse(row, credit, env = {}) {
  return {
    ...mapPublicReceipt(row, env),
    status: row.status,
    credit: {
      counted: Boolean(credit?.counted),
      amount: Number(credit?.amount || 0),
      reason: credit?.reason || "existing receipt",
      remaining: credit?.remaining,
    },
    artifacts: {},
    verification: { checks: [{ name: "credit_available", status: "pass" }] },
  };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw httpError(400, "Invalid JSON body.");
  }
}

function mapTopUp(row) {
  const now = Date.now();
  const expiresAt = row.expires_at || null;
  const isExpired = row.status === "waiting_for_payment" && expiresAt && Date.parse(expiresAt) < now;
  return {
    paymentId: row.id,
    status: isExpired ? "expired" : row.status,
    network: "base",
    chainId: BASE_CHAIN_ID,
    token: { symbol: "USDC", address: BASE_USDC_ADDRESS, decimals: 6 },
    amountUsdc: row.amount_usdc,
    creditAmount: row.credit_amount,
    receivingAddress: row.receiving_address,
    billingWallet: row.billing_wallet,
    expiresAt,
    createdAt: row.created_at,
    creditedAt: row.credited_at || undefined,
    txHash: row.tx_hash || undefined,
  };
}

function json(body, env, request, status = 200) {
  return corsResponse(JSON.stringify(body), env, request, status, JSON_HEADERS);
}

function corsResponse(body, env, request, status = 200, headers = {}) {
  const origin = allowedOrigin(request, env);
  return new Response(body, {
    status,
    headers: {
      ...headers,
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Vary": "Origin",
    },
  });
}

function allowedOrigin(request, env) {
  const requestOrigin = request.headers.get("Origin") || "";
  const configured = String(env.ALLOWED_ORIGIN || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  const defaults = [
    "https://txreceipts.com.tr",
    "https://www.txreceipts.com.tr",
    "https://madmin27.github.io",
    "https://madmin27.github.io/OnchainReceipts",
  ];
  const allowed = new Set([...defaults, ...configured]);
  return allowed.has(requestOrigin) ? requestOrigin : (configured[0] || defaults[0]);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
