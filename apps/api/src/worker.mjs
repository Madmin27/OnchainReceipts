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

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

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
  if (request.method === "OPTIONS") return corsResponse(null, env, 204);
  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, service: "txreceipts-api" }, env);
  }

  try {
    if (request.method === "POST" && url.pathname === "/v1/admin/projects") {
      await requireAdmin(request, env);
      return json(await createProject(request, env), env, 201);
    }
    if (request.method === "POST" && url.pathname === "/v1/credits/topups") {
      const project = await requireProject(request, env);
      return json(await createTopUp(request, env, project), env, 201);
    }
    const topUpMatch = url.pathname.match(/^\/v1\/credits\/topups\/([^/]+)$/);
    if (request.method === "GET" && topUpMatch) {
      const project = await requireProject(request, env);
      return json(await getTopUp(env, project.id, topUpMatch[1]), env);
    }
    const projectCreditsMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)\/credits$/);
    if (request.method === "GET" && projectCreditsMatch) {
      const project = await requireProject(request, env);
      if (project.id !== projectCreditsMatch[1]) throw httpError(403, "Project mismatch.");
      return json(await projectCredits(env, project.id), env);
    }
    if (request.method === "POST" && url.pathname === "/v1/receipts") {
      const project = await requireProject(request, env);
      return json(await createReceipt(request, env, project), env, 201);
    }
    if (request.method === "POST" && url.pathname === "/v1/ai/accounting-answer") {
      return json(await answerAccountingQuestion(request, env), env);
    }
    return json({ error: "Not found" }, env, 404);
  } catch (error) {
    return json({ error: error.message || "Unexpected error" }, env, error.status || 500);
  }
}

async function answerAccountingQuestion(request, env) {
  if (!env.AI_API_KEY) throw httpError(503, "AI_API_KEY is not configured.");
  const body = await readJson(request);
  const question = String(body.question || "").trim().slice(0, 500);
  if (!question) throw httpError(400, "Missing question.");
  const context = compactAiContext(body.context || {});
  const baseUrl = (env.AI_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
  const model = env.AI_MODEL || "llama-3.1-8b-instant";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 180,
      messages: [
        {
          role: "system",
          content: [
            "You are TxReceipts Accounting AI.",
            "Answer only from the provided compact accounting JSON.",
            "Do not invent balances, tax treatment, dates, or missing fees.",
            "Keep the answer under 90 words.",
            "Use a concise accounting report style.",
            "If data is missing, say exactly what is missing and what the user should load.",
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
  };
}

function compactAiContext(context) {
  return {
    network: String(context.network || "").slice(0, 80),
    scope: String(context.scope || "").slice(0, 160),
    wallet: String(context.wallet || "").slice(0, 80),
    selectedTx: String(context.selectedTx || "").slice(0, 100),
    report: context.report || {},
    selectedReceipt: context.selectedReceipt || null,
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
  if (Number(body.chainId) !== BASE_CHAIN_ID) throw httpError(400, "Only Base receipts are billable in the launch API.");
  if (!/^0x[a-fA-F0-9]{64}$/.test(String(body.txHash || ""))) throw httpError(400, "Invalid txHash.");
  const idempotencyKey = request.headers.get("Idempotency-Key")
    || body.idempotencyKey
    || `${project.id}:${body.chainId}:${String(body.txHash).toLowerCase()}`;

  const existing = await env.DB.prepare(
    "SELECT id, status FROM receipts WHERE project_id = ? AND (idempotency_key = ? OR tx_hash = ?)"
  ).bind(project.id, idempotencyKey, String(body.txHash).toLowerCase()).first();
  if (existing) {
    return {
      receiptId: existing.id,
      status: existing.status,
      credit: { counted: false, amount: 0, reason: "duplicate project + chain + tx hash", remaining: await getBalance(env, project.id) },
      artifacts: {},
      verification: { checks: [] },
    };
  }

  const balance = await getBalance(env, project.id);
  if (!canSpendCredit(balance, 1)) throw httpError(402, "Credit balance below -10 overdraft limit.");
  const receiptId = `or_base_${String(body.txHash).slice(2, 10)}_${crypto.randomUUID().slice(0, 8)}`;
  const balanceAfter = balance - 1;

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO receipts (id, project_id, chain_id, tx_hash, status, idempotency_key) VALUES (?, ?, ?, ?, 'verified', ?)"
    ).bind(receiptId, project.id, BASE_CHAIN_ID, String(body.txHash).toLowerCase(), idempotencyKey),
    env.DB.prepare(
      `INSERT INTO credit_ledger (id, project_id, source, receipt_id, delta, balance_after, reason)
       VALUES (?, ?, 'receipt_usage', ?, -1, ?, 'verified receipt usage')`
    ).bind(`cl_${crypto.randomUUID()}`, project.id, receiptId, balanceAfter),
  ]);

  return {
    receiptId,
    status: "verified",
    credit: { counted: true, amount: 1, reason: "verified receipt usage", remaining: balanceAfter },
    artifacts: {},
    verification: { checks: [{ name: "credit_available", status: "pass" }] },
  };
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

function json(body, env, status = 200) {
  return corsResponse(JSON.stringify(body), env, status, JSON_HEADERS);
}

function corsResponse(body, env, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      ...headers,
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "https://txreceipts.com.tr",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
