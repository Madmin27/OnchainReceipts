import {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  CREDIT_OVERDRAFT_LIMIT,
  REQUIRED_CONFIRMATIONS,
  canSpendCredit,
  creditsForUsdc,
  normalizeAddress,
  validateObservedTransfer,
  validateTopUpIntent,
} from "./billing.mjs";
import { detectQuestionRoute, routingNote } from "./questionRouter.mjs";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const RECEIPT_BASE_URL = "https://txreceipts.com.tr";
const CHAIN_NETWORK_CODE = {
  1: "ETH",
  137: "POLYGON",
  8453: "BASE",
  42161: "ARB",
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

  await ensureReceiptSchema(env);

  try {
    if (request.method === "POST" && url.pathname === "/v1/admin/projects") {
      await requireAdmin(request, env);
      return json(await createProject(request, env), env, request, 201);
    }
    if (request.method === "POST" && url.pathname === "/v1/credits/topups") {
      const project = await requireProject(request, env);
      return json(await createTopUp(request, env, project), env, request, 201);
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

async function answerAccountingQuestion(request, env) {
  if (!env.AI_API_KEY) throw httpError(503, "AI_API_KEY is not configured.");
  const body = await readJson(request);
  const question = String(body.question || "").trim().slice(0, 500);
  if (!question) throw httpError(400, "Missing question.");
  const context = compactAiContext(body.context || {});
  const route = detectQuestionRoute(question, context);
  const baseUrl = (env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = env.AI_MODEL || "gpt-4.1-mini";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content: [
            "You are TxReceipts Accounting AI.",
            "Answer only from the provided compact accounting JSON.",
            "Only answer questions about the provided network's wallet activity, transactions, fees, token movements, categories, exports, receipts, and reconciliation.",
            "If the question is outside that scope, say it is out of scope.",
            "When context.selectedTx, context.selectedReceipt, or context.selectedLedgerRow is present, treat the question as transaction-scoped unless the user explicitly asks wallet-wide or time-window totals.",
            "Use selectedReceipt and selectedLedgerRow first for transaction-specific answers, then use rows and analysis for broader wallet questions.",
            "Prefer context.analysis when ranking, sorting, or summarizing top transactions in time windows.",
            "Do not fall back to a generic wallet summary unless it directly answers the question.",
            "Do not invent balances, tax treatment, dates, or missing fees.",
            "Keep the answer under 120 words.",
            "Use a concise accounting report style.",
            "Format the answer as 3 short parts when possible: Answer, Evidence, Missing.",
            "Evidence must cite concrete context fields such as tx hash, status, method, sent, received, gas, direction, category, feeValue, gasUsed, gasPrice, or timestamps.",
            "If the data is incomplete, say Confidence: low in the Missing part.",
            "If data is missing, say exactly what is missing and what the user should load.",
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
  return {
    answer: String(answer).trim().slice(0, 1200) || "AI could not prepare an answer from the provided accounting context.",
    source: "ai",
    model,
    route,
  };
}

function compactAiContext(context) {
  return {
    network: String(context.network || "").slice(0, 80),
    scope: String(context.scope || "").slice(0, 160),
    wallet: String(context.wallet || "").slice(0, 80),
    selectedTx: String(context.selectedTx || "").slice(0, 100),
    report: context.report || {},
    analysis: context.analysis || {},
    selectedReceipt: context.selectedReceipt || null,
    selectedLedgerRow: context.selectedLedgerRow || null,
    rows: Array.isArray(context.rows) ? context.rows.slice(0, 40) : [],
  };
}

async function createProject(request, env) {
  const body = await readJson(request);
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

async function projectCredits(env, projectId) {
  const balance = await getBalance(env, projectId);
  const usage = await env.DB.prepare(
    "SELECT COUNT(*) AS receipts FROM receipts WHERE project_id = ?"
  ).bind(projectId).first();
  return { projectId, balance, overdraftLimit: CREDIT_OVERDRAFT_LIMIT, receipts: Number(usage?.receipts || 0) };
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
    return mapReceiptResponse(existing, {
      remaining: await getBalance(env, project.id),
      counted: false,
      amount: 0,
      reason: "duplicate chain + tx hash + owner wallet",
    }, env);
  }

  const balance = await getBalance(env, project.id);
  if (!canSpendCredit(balance, 1)) throw httpError(402, "Credit balance below -10 overdraft limit.");
  const balanceAfter = balance - 1;
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
    env.DB.prepare(
      `INSERT INTO credit_ledger (id, project_id, source, receipt_id, delta, balance_after, reason)
       VALUES (?, ?, 'receipt_usage', ?, -1, ?, 'verified receipt usage')`
    ).bind(`cl_${crypto.randomUUID()}`, project.id, receiptId, balanceAfter),
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
    remaining: balanceAfter,
    counted: true,
    amount: 1,
    reason: "verified receipt usage",
  }, env);
}

async function getReceipt(env, projectId, receiptId) {
  const row = await env.DB.prepare("SELECT * FROM receipts WHERE id = ? AND project_id = ? LIMIT 1").bind(String(receiptId || "").toUpperCase(), projectId).first();
  if (!row) throw httpError(404, "Receipt not found.");
  return mapReceiptResponse(row, {
    remaining: await getBalance(env, projectId),
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
  return mapReceiptResponse(updated, {
    remaining: await getBalance(env, project.id),
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
  const auth = request.headers.get("Authorization") || "";
  const apiKey = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!apiKey) throw httpError(401, "Missing API key.");
  const hash = await sha256(apiKey);
  const project = await env.DB.prepare("SELECT * FROM projects WHERE api_key_hash = ? AND status = 'active'").bind(hash).first();
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
  return {
    receiptId: row.id,
    network: String(row.network || networkCodeForChainId(row.chain_id)).toLowerCase(),
    chainId: Number(row.chain_id),
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
  return {
    paymentId: row.id,
    status: row.status,
    network: "base",
    chainId: BASE_CHAIN_ID,
    token: { symbol: "USDC", address: BASE_USDC_ADDRESS, decimals: 6 },
    amountUsdc: row.amount_usdc,
    creditAmount: row.credit_amount,
    receivingAddress: row.receiving_address,
    billingWallet: row.billing_wallet,
    expiresAt: row.expires_at,
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
