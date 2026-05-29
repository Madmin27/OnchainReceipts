let receipt = null;

const txForm = document.querySelector("#txForm");
const txInput = document.querySelector("#txHash");
const txStatus = document.querySelector("#txStatus");
const connectWalletButton = document.querySelector("#connectWallet");
const walletLabel = document.querySelector("#walletLabel");
const networkSelect = document.querySelector("#networkSelect");
const walletProviderSelect = document.querySelector("#walletProviderSelect");
const targetAddressForm = document.querySelector("#targetAddressForm");
const targetAddressInput = document.querySelector("#targetAddressInput");
const loadMoreHistoryButton = document.querySelector("#loadMoreHistory");
const historyStatus = document.querySelector("#historyStatus");
const historyList = document.querySelector("#historyList");
const historyTabs = document.querySelectorAll("[data-history-tab]");
const projectIdInput = document.querySelector("#projectIdInput");
const apiKeyInput = document.querySelector("#apiKeyInput");
const checkCreditsButton = document.querySelector("#checkCredits");
const creditBalance = document.querySelector("#creditBalance");
const creditStatus = document.querySelector("#creditStatus");
const topUpAmountInput = document.querySelector("#topUpAmountInput");
const billingWalletInput = document.querySelector("#billingWalletInput");
const createTopUpButton = document.querySelector("#createTopUp");
const topUpInstructions = document.querySelector("#topUpInstructions");
const qaForm = document.querySelector("#qaForm");
const qaQuestionInput = document.querySelector("#qaQuestion");
const qaAnswer = document.querySelector("#qaAnswer");
const qaContext = document.querySelector("#qaContext");
const qaSubmitButton = qaForm?.querySelector('button[type="submit"]');
const quickQuestionButtons = document.querySelectorAll("[data-question]");
const READY_QUESTION_METADATA = {
  "Summarize this wallet.": "Fields used: loaded rows, accounting direction, accounting category, verification status, network scope.",
  "Summarize this transaction.": "Fields used: selected receipt title, purpose, sent/received values, status, date.",
  "Is this income or expense?": "Fields used: selected ledger row direction, category, memo, verification status.",
  "Is this a business expense?": "Fields used: selected ledger row category, direction, memo override, verification status.",
  "How much gas did I pay?": "Fields used: selected receipt gas value, receipt status, accounting note.",
  "Calculate the fees I paid in the last 7 days.": "Fields used: loaded transaction fee fields from the last 7 days on the current network.",
  "Show app fees.": "Fields used: loaded rows classified as app_fee, numeric row values, current network scope.",
  "Show protocol fees.": "Fields used: loaded rows classified as protocol_fee, numeric row values, current network scope.",
  "Show subscription rows.": "Fields used: loaded rows classified as subscription, numeric row values, timestamps, tx hashes.",
  "Which tokens moved?": "Fields used: selected receipt sent tokens, received tokens, rendered receipt rows.",
  "Is this receipt verified?": "Fields used: selected receipt status, evidence summary, method.",
  "How much did I spend this month?": "Fields used: loaded rows, expense direction counts, estimated outgoing numeric values, current network scope.",
  "Show the largest expenses.": "Fields used: loaded expense rows, numeric values, timestamps, tx hashes.",
  "Which dapp did I use the most?": "Fields used: loaded row titles grouped by visible activity count.",
  "Show uncategorized transactions.": "Fields used: loaded rows with uncategorized category, timestamp, title, tx hash.",
  "Export accountant summary.": "Fields used: loaded records, income/expense counts, fee summaries, uncategorized count, verification count, export actions.",
};
const READY_QUESTION_SET = new Set([...quickQuestionButtons].map(button => String(button.dataset.question || button.textContent || "").trim()).filter(Boolean));
const downloadMonthlyCsvButton = document.querySelector("#downloadMonthlyCsv");
const printMonthlyReportButton = document.querySelector("#printMonthlyReport");
const accountingScope = document.querySelector("#accountingScope");
const accountingOutgoing = document.querySelector("#accountingOutgoing");
const accountingIncoming = document.querySelector("#accountingIncoming");
const accountingTokens = document.querySelector("#accountingTokens");
const accountingReview = document.querySelector("#accountingReview");
const accountingPeriod = document.querySelector("#accountingPeriod");
const accountingExceptions = document.querySelector("#accountingExceptions");
const accountingExports = document.querySelector("#accountingExports");
const monthlyIncome = document.querySelector("#monthlyIncome");
const monthlyExpenses = document.querySelector("#monthlyExpenses");
const monthlyGasFees = document.querySelector("#monthlyGasFees");
const monthlyAppFees = document.querySelector("#monthlyAppFees");
const monthlySwaps = document.querySelector("#monthlySwaps");
const monthlySubscriptions = document.querySelector("#monthlySubscriptions");
const monthlyUncategorized = document.querySelector("#monthlyUncategorized");
const monthlyVerified = document.querySelector("#monthlyVerified");
const addMemoButton = document.querySelector("#addMemoButton");
const markBusinessExpenseButton = document.querySelector("#markBusinessExpenseButton");
const markInternalTransferButton = document.querySelector("#markInternalTransferButton");
const downloadReceiptButton = document.querySelector("#downloadReceiptButton");
const exportRowButton = document.querySelector("#exportRowButton");
const txActionStatus = document.querySelector("#txActionStatus");

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ETH_DECIMALS = 18n;
const PAGE_SIZE = 20;
const SOLANA_HISTORY_PAGE_ATTEMPTS = 5;
const MAX_QR_BYTES = 80_000;
const RECEIPT_WIDTH = 1720;
const RECEIPT_HEIGHT = 1900;
const API_BASE_URLS = ["https://api.txreceipts.com.tr", "https://txreceipts-api.evpc77.workers.dev"];
const MOBILE_WALLET_OPTIONS = [
  { id: "mobile-metamask", name: "MetaMask", family: "evm" },
  { id: "mobile-coinbase", name: "Coinbase Wallet", family: "evm" },
  { id: "mobile-trust", name: "Trust Wallet", family: "evm" },
  { id: "mobile-phantom", name: "Phantom", family: "solana" },
  { id: "mobile-solflare", name: "Solflare", family: "solana" },
];
const QUESTION_LOG_KEY = "txreceipts_question_logs_v1";
const ACCOUNTING_OVERRIDES_KEY = "txreceipts_accounting_overrides_v1";
const TARGET_ADDRESS_KEY = "txreceipts_target_address_v1";
const networks = window.TX_RECEIPTS_NETWORKS || [];

const knownTokens = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6n },
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18n },
  "0x4200000000000000000000000000000000000042": { symbol: "OP", decimals: 18n },
  "0x532f27101965dd16442e59d40670faf5ebb142e4": { symbol: "BRETT", decimals: 18n },
};

let connectedWallet = null;
let walletProvider = null;
let targetAddress = null;
let activeHistoryTab = "all";
let visibleHistoryLimit = PAGE_SIZE;
let historyState = {
  transactions: [],
  transfers: [],
  txNext: null,
  transferNext: null,
};

function safeDisplay(value, maxLength = 120) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

async function apiFetch(path, options = {}) {
  let lastError = null;
  for (const baseUrl of API_BASE_URLS) {
    try {
      return await fetch(`${baseUrl}${path}`, options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("API is unreachable.");
}

function currentNetwork() {
  return networks.find(network => network.id === networkSelect.value) || networks[0];
}

function isMobileBrowser() {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || "");
}

function mobileWalletOption(id) {
  return MOBILE_WALLET_OPTIONS.find(option => option.id === id) || null;
}

function currentDappUrl() {
  return window.location.href;
}

function mobileWalletLaunchUrl(id) {
  const currentUrl = currentDappUrl();
  const strippedUrl = currentUrl.replace(/^https?:\/\//i, "");
  if (id === "mobile-metamask") return `https://link.metamask.io/dapp/${strippedUrl}`;
  if (id === "mobile-coinbase") return `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(currentUrl)}`;
  if (id === "mobile-trust") return `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(currentUrl)}`;
  if (id === "mobile-phantom") return `https://phantom.app/ul/browse/${encodeURIComponent(currentUrl)}?ref=${encodeURIComponent(window.location.origin)}`;
  if (id === "mobile-solflare") return `https://solflare.com/ul/v1/browse/${encodeURIComponent(currentUrl)}?ref=${encodeURIComponent(window.location.origin)}`;
  return null;
}

function networkByFamily(family) {
  return networks.find(network => network.family === family) || networks[0];
}

function networkRpcUrls(network) {
  return Array.isArray(network.rpcUrls) && network.rpcUrls.length > 0
    ? network.rpcUrls
    : [network.rpcUrl];
}

function selectedWalletInfo() {
  return window.TxReceiptsWallets?.getInfo(walletProviderSelect.value)
    || mobileWalletOption(walletProviderSelect.value)
    || null;
}

function walletOptions() {
  const discovered = window.TxReceiptsWallets?.list() || [];
  if (!isMobileBrowser()) return discovered;
  const merged = [...discovered];
  MOBILE_WALLET_OPTIONS.forEach(option => {
    if (!merged.some(item => item.id === option.id || (item.family === option.family && normalizeWalletLabel(item.name) === normalizeWalletLabel(option.name)))) {
      merged.push(option);
    }
  });
  return merged;
}

function normalizeWalletLabel(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function setStatus(message, tone = "neutral") {
  txStatus.textContent = message;
  txStatus.dataset.tone = tone;
}

function setHistoryStatus(message, tone = "neutral") {
  historyStatus.textContent = message;
  historyStatus.dataset.tone = tone;
}

function setCreditStatus(message, tone = "neutral") {
  if (!creditStatus) return;
  creditStatus.textContent = message;
  creditStatus.dataset.tone = tone;
}

function setTxActionStatus(message, tone = "neutral") {
  if (!txActionStatus) return;
  txActionStatus.textContent = message;
  txActionStatus.dataset.tone = tone;
}

function setQaAnswer(message, source = "template") {
  if (!qaAnswer) return;
  qaAnswer.textContent = message;
  qaAnswer.dataset.source = source;
}

function readAccountingOverrides() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTING_OVERRIDES_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeAccountingOverrides(overrides) {
  localStorage.setItem(ACCOUNTING_OVERRIDES_KEY, JSON.stringify(overrides));
}

function currentTargetAddress() {
  return targetAddress || connectedWallet || null;
}

function readTargetAddress() {
  return localStorage.getItem(TARGET_ADDRESS_KEY) || "";
}

function writeTargetAddress(value) {
  if (!value) {
    localStorage.removeItem(TARGET_ADDRESS_KEY);
    return;
  }
  localStorage.setItem(TARGET_ADDRESS_KEY, value);
}

function validAddressForCurrentNetwork(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (currentNetwork().family === "solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text);
  return /^0x[a-fA-F0-9]{40}$/.test(text);
}

function addressPlaceholder() {
  return currentNetwork().family === "solana" ? "Solana address" : "0x wallet address";
}

function syncTargetAddressInput() {
  if (!targetAddressInput) return;
  targetAddressInput.placeholder = addressPlaceholder();
  targetAddressInput.value = currentTargetAddress() || "";
}

function setTargetAddress(address, { load = true, persist = true } = {}) {
  targetAddress = address ? String(address).trim() : null;
  if (persist) writeTargetAddress(targetAddress);
  syncTargetAddressInput();
  if (!load) return;
  if (currentTargetAddress() && validAddressForCurrentNetwork(currentTargetAddress())) {
    loadHistory();
    return;
  }
  resetHistory();
}

function accountingOverrideKey(txHash) {
  return `${currentNetwork().id}:${(currentTargetAddress() || "wallet").toLowerCase()}:${String(txHash || "").toLowerCase()}`;
}

function getAccountingOverride(txHash) {
  if (!txHash) return null;
  const overrides = readAccountingOverrides();
  return overrides[accountingOverrideKey(txHash)] || null;
}

function setAccountingOverride(txHash, patch) {
  const overrides = readAccountingOverrides();
  const key = accountingOverrideKey(txHash);
  overrides[key] = {
    ...(overrides[key] || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeAccountingOverrides(overrides);
}

function setQaLoading(isLoading) {
  if (qaAnswer) qaAnswer.dataset.loading = isLoading ? "true" : "false";
  if (qaSubmitButton) {
    qaSubmitButton.disabled = isLoading;
    qaSubmitButton.textContent = isLoading ? "Searching..." : "AI Answer";
  }
}

function setQaContext(message, tone = "neutral") {
  if (!qaContext) return;
  qaContext.textContent = message;
  qaContext.dataset.tone = tone;
}

function currentNetworkScopeText() {
  return `This answer only uses ${currentNetwork().name} data currently loaded in TxReceipts.`;
}

function apiAuthInputs() {
  return {
    projectId: projectIdInput?.value.trim() || "",
    apiKey: apiKeyInput?.value.trim() || "",
  };
}

function requireApiAuthInputs() {
  const inputs = apiAuthInputs();
  if (!inputs.projectId || !inputs.apiKey) {
    setCreditStatus("Enter a project ID and API key.", "error");
    return null;
  }
  return inputs;
}

async function rpc(method, params) {
  const network = currentNetwork();
  const response = await fetch(networkRpcUrls(network)[0], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });

  if (!response.ok) {
    throw new Error(`${network.name} RPC returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message || `${network.name} RPC error`);
  }

  return payload.result;
}

async function solanaRpc(method, params) {
  const network = currentNetwork();
  let lastError = null;

  for (const rpcUrl of networkRpcUrls(network)) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      });
      if (!response.ok) throw new Error(`${network.name} RPC returned HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error.message || `${network.name} RPC error`);
      return payload.result;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`${network.name} RPC unavailable`);
}

function hexToBigInt(value) {
  if (!value || value === "0x") return 0n;
  return BigInt(value);
}

function formatUnits(value, decimals, maxDigits = 6) {
  const base = 10n ** decimals;
  const integer = value / base;
  const fraction = value % base;
  if (fraction === 0n) return integer.toString();

  const fractionText = fraction.toString().padStart(Number(decimals), "0").slice(0, maxDigits);
  return `${integer}.${fractionText.replace(/0+$/, "")}`;
}

function encodeErc20BalanceOf(address) {
  const normalized = String(address || "").replace(/^0x/i, "").toLowerCase();
  return `0x70a08231000000000000000000000000${normalized}`;
}

async function evmTokenBalanceSnapshot(wallet) {
  const nativeHex = await rpc("eth_getBalance", [wallet, "latest"]);
  const nativeRaw = hexToBigInt(nativeHex || "0x0");
  const tokenEntries = await Promise.all(Object.entries(knownTokens).map(async ([address, metadata]) => {
    try {
      const raw = await rpc("eth_call", [{ to: address, data: encodeErc20BalanceOf(wallet) }, "latest"]);
      const value = hexToBigInt(raw || "0x0");
      return {
        address,
        symbol: metadata.symbol,
        decimals: Number(metadata.decimals || 18n),
        amount: formatUnits(value, BigInt(metadata.decimals || 18n), 8),
        raw: value.toString(),
      };
    } catch {
      return null;
    }
  }));
  return {
    network: currentNetwork().name,
    wallet,
    native: {
      symbol: currentNetwork().nativeCurrency?.symbol || "ETH",
      decimals: Number(ETH_DECIMALS),
      amount: formatUnits(nativeRaw, ETH_DECIMALS, 8),
      raw: nativeRaw.toString(),
    },
    tokens: tokenEntries.filter(Boolean),
    asOf: new Date().toISOString(),
    source: "rpc",
  };
}

async function solanaTokenBalanceSnapshot(wallet) {
  const [nativeBalance, tokenAccounts] = await Promise.all([
    solanaRpc("getBalance", [wallet]),
    solanaRpc("getTokenAccountsByOwner", [
      wallet,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ]).catch(() => ({ value: [] })),
  ]);
  return {
    network: currentNetwork().name,
    wallet,
    native: {
      symbol: "SOL",
      decimals: 9,
      amount: lamportsToSol(BigInt(nativeBalance?.value || 0)),
      raw: String(nativeBalance?.value || 0),
    },
    tokens: Array.isArray(tokenAccounts?.value) ? tokenAccounts.value.map(item => {
      const parsed = item?.account?.data?.parsed?.info;
      const tokenAmount = parsed?.tokenAmount || {};
      return {
        mint: parsed?.mint || null,
        symbol: parsed?.mint || "SPL",
        decimals: Number(tokenAmount.decimals || 0),
        amount: String(tokenAmount.uiAmountString || tokenAmount.amount || "0"),
        raw: String(tokenAmount.amount || "0"),
      };
    }).filter(item => item.mint) : [],
    asOf: new Date().toISOString(),
    source: "rpc",
  };
}

async function walletBalanceSnapshot() {
  const wallet = currentTargetAddress();
  if (!wallet || !validAddressForCurrentNetwork(wallet)) return null;
  if (currentNetwork().family === "solana") return solanaTokenBalanceSnapshot(wallet);
  return evmTokenBalanceSnapshot(wallet);
}

function shortHash(value) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function labelAddress(entity) {
  if (!entity) return "Unknown";
  return safeDisplay(entity.ens_domain_name || entity.name || shortHash(entity.hash || entity), 48);
}

function sameAddress(a, b) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function formatDecimalUnits(value, decimals = 18, maxDigits = 6) {
  try {
    return formatUnits(BigInt(value || "0"), BigInt(decimals || 18), maxDigits);
  } catch {
    return "0";
  }
}

function formatEthValue(value, maxDigits = 6) {
  return `${formatDecimalUnits(value || "0", 18, maxDigits)} ETH`;
}

function formatDate(value) {
  if (!value) return "Unknown date";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function buildUrl(path, params = null) {
  const network = currentNetwork();
  const url = new URL(path, network.blockscoutUrl);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`History API returned HTTP ${response.status}`);
  return response.json();
}

function pageParamsToQuery(params) {
  if (!params) return null;
  return params;
}

function normalizeTx(item) {
  const wallet = currentTargetAddress();
  const from = item.from?.hash || "";
  const to = item.to?.hash || "";
  const isIncoming = sameAddress(to, wallet) && !sameAddress(from, wallet);
  const isOutgoing = sameAddress(from, wallet);
  const method = item.method || item.decoded_input?.method_call?.split("(")[0] || "transaction";
  return {
    kind: "tx",
    hash: safeDisplay(item.hash, 66),
    title: `${isIncoming ? "Incoming" : isOutgoing ? "Outgoing" : "Contract"} ${safeDisplay(method, 40)}`,
    subtitle: `${labelAddress(item.from)} -> ${labelAddress(item.to)}`,
    timestamp: item.timestamp,
    value: item.value && item.value !== "0" ? formatEthValue(item.value) : safeDisplay(item.status || item.result || "ok", 48),
    direction: isIncoming ? "incoming" : isOutgoing ? "outgoing" : "other",
    fee: item.fee,
    transaction_fee: item.transaction_fee,
    tx_fee: item.tx_fee,
    gas_used: item.gas_used,
    gasPrice: item.gasPrice,
    gas_price: item.gas_price,
  };
}

function normalizeTransfer(item) {
  const wallet = currentTargetAddress();
  const from = item.from?.hash || "";
  const to = item.to?.hash || "";
  const tokenType = item.token_type || item.token?.type || "token";
  const isNft = tokenType === "ERC-721" || tokenType === "ERC-1155";
  const decimals = item.total?.decimals ?? item.token?.decimals ?? (isNft ? 0 : 18);
  const symbol = safeDisplay(item.token?.symbol || item.token?.name || tokenType, 24);
  const amount = isNft
    ? `#${item.total?.token_id || "token"}`
    : `${formatDecimalUnits(item.total?.value || "0", decimals)} ${symbol}`;
  const isIncoming = sameAddress(to, wallet) && !sameAddress(from, wallet);
  const isOutgoing = sameAddress(from, wallet);

  return {
    kind: isNft ? "nft" : "token",
    hash: safeDisplay(item.transaction_hash, 66),
    title: `${isIncoming ? "Incoming" : isOutgoing ? "Outgoing" : "Observed"} ${tokenType}`,
    subtitle: `${labelAddress(item.from)} -> ${labelAddress(item.to)}`,
    timestamp: item.timestamp,
    value: amount,
    direction: isIncoming ? "incoming" : isOutgoing ? "outgoing" : "other",
    usdValue: Number(item.token?.exchange_rate || 0) > 0 && !isNft
      ? Number(formatDecimalUnits(item.total?.value || "0", decimals, 8) || 0) * Number(item.token?.exchange_rate || 0)
      : 0,
  };
}

function normalizedHistoryItems() {
  const normalized = currentNetwork().family === "solana"
    ? historyState.transactions.map(normalizeSolanaTx)
    : [
        ...historyState.transactions.map(normalizeTx),
        ...historyState.transfers.map(normalizeTransfer),
      ];
  const unique = new Map();
  for (const item of normalized) {
    const key = `${item.kind}:${item.hash}:${item.title}:${item.value}`;
    if (!unique.has(key)) unique.set(key, item);
  }

  return [...unique.values()]
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
}

function allHistoryItems() {
  return normalizedHistoryItems()
    .filter(item => {
      if (activeHistoryTab === "all") return item.kind === "tx";
      if (activeHistoryTab === "tokens") return item.kind === "token";
      if (activeHistoryTab === "nfts") return item.kind === "nft";
      return item.direction === activeHistoryTab;
    });
}

function normalizeSolanaTx(item) {
  const failed = Boolean(item.err);
  return {
    kind: "tx",
    hash: safeDisplay(item.signature, 96),
    title: failed ? "Solana transaction failed" : "Solana transaction",
    subtitle: `${shortHash(currentTargetAddress() || "wallet")} - slot ${item.slot || "unknown"}`,
    timestamp: item.blockTime ? new Date(item.blockTime * 1000).toISOString() : null,
    value: failed ? "failed" : "ok",
    direction: "other",
  };
}

function accountingCategoryForItem(item) {
  const override = getAccountingOverride(item.hash);
  if (override?.category) return override.category;
  const text = `${item.title} ${item.subtitle} ${item.value}`.toLowerCase();
  if (/failed|error/.test(text)) return "uncategorized";
  if (/app fee|service fee|platform fee/.test(text)) return "app_fee";
  if (/protocol fee|bridge fee|router fee|lp fee/.test(text)) return "protocol_fee";
  if (/swap|exchange|router/.test(text)) return "swap";
  if (/subscription|renew/.test(text)) return "subscription";
  if (/creator|support|mint/.test(text)) return "creator_payment";
  if (/refund/.test(text)) return "refund";
  if (/fee|gas/.test(text)) return "gas_fee";
  if (item.direction === "incoming") return "sales";
  if (item.direction === "outgoing") return "purchase";
  if (item.direction === "other") return "uncategorized";
  return "internal_transfer";
}

function accountingDirectionForItem(item) {
  const override = getAccountingOverride(item.hash);
  if (override?.direction) return override.direction;
  const category = accountingCategoryForItem(item);
  if (category === "swap") return "swap";
  if (category === "internal_transfer") return "transfer";
  if (category === "gas_fee" || item.direction === "outgoing") return "expense";
  if (item.direction === "incoming") return "income";
  return "unknown";
}

function accountingMetaForItem(item) {
  const override = getAccountingOverride(item.hash);
  const category = accountingCategoryForItem(item);
  const direction = accountingDirectionForItem(item);
  const status = /failed|error/i.test(`${item.title} ${item.value}`) ? "failed" : "verified";
  return {
    direction,
    category,
    status,
    memo: override?.memo || `${category.replaceAll("_", " ")} candidate from loaded ${currentNetwork().name} row`,
  };
}

function selectedLedgerItem() {
  const txHash = txInput?.value.trim();
  if (!txHash) return null;
  return buildMonthlyReport().items.find(item => item.hash === txHash) || null;
}

function formatFeeText(item) {
  if (currentNetwork().family === "solana") {
    return item.fee ? `${lamportsToSol(BigInt(item.fee || 0))} SOL` : "Not available";
  }
  const feeWei = blockscoutFeeWei(item);
  if (feeWei <= 0n) return "Not available";
  return `${formatUnits(feeWei, ETH_DECIMALS, 8)} ${currentNetwork().nativeCurrency?.symbol || "ETH"}`;
}

function formatGasText(item) {
  if (currentNetwork().family === "solana") return "Not available";
  const gasUsed = item.gas_used || item.gasUsed || item.gas;
  return gasUsed ? `${gasUsed}` : "Not available";
}

function exportLedgerRow(item) {
  const payload = {
    network: currentNetwork().id,
    wallet: currentTargetAddress(),
    tx: item.hash,
    timestamp: item.timestamp,
    title: item.title,
    subtitle: item.subtitle,
    value: item.value,
    gas: formatGasText(item),
    fee: formatFeeText(item),
    accounting: item.accounting,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${currentNetwork().id}-${safeDisplay(item.hash, 18)}-accounting-row.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function combinedHistoryItems() {
  return allHistoryItems().slice(0, visibleHistoryLimit);
}

function renderHistory() {
  const items = combinedHistoryItems();
  const allItems = allHistoryItems();
  historyList.textContent = "";
  updateAccountingPanel();

  if (!currentTargetAddress()) {
    setHistoryStatus(`Connect a wallet or enter an address to load the latest ${currentNetwork().name} activity.`);
    loadMoreHistoryButton.hidden = true;
    return;
  }

  if (!items.length) {
    setHistoryStatus("No activity found for this tab yet.");
    loadMoreHistoryButton.hidden = !historyState.txNext && !historyState.transferNext;
    return;
  }

  setHistoryStatus(`Showing ${items.length} of ${allItems.length} ${activeHistoryTab === "all" ? "transaction" : activeHistoryTab} record${items.length === 1 ? "" : "s"}.`);
  if (!txInput.value.trim() && items[0]?.hash) {
    txInput.value = items[0].hash;
    setQaContext(`Latest ${currentNetwork().name} tx selected: ${shortHash(items[0].hash)}`);
  }

  for (const item of items) {
    const row = document.createElement("div");
    const summary = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const details = document.createElement("div");
    const receiptAction = document.createElement("button");
    const accounting = accountingMetaForItem(item);
    row.className = "history-item";
    row.classList.add(`history-item--${historyTone(item, accounting)}`);
    summary.className = "history-summary";
    title.textContent = safeDisplay(item.title);
    meta.className = "history-meta";
    meta.textContent = `${shortHash(item.hash)} - ${formatDate(item.timestamp)} - ${safeDisplay(item.value, 48)}`;
    details.className = "history-columns";
    [
      ["Direction", accounting.direction],
      ["Category", accounting.category],
      ["Counterparty", safeDisplay(item.subtitle, 56)],
      ["Gas", formatGasText(item)],
      ["Fee", formatFeeText(item)],
      ["Receipt", accounting.status],
      ["Memo", accounting.memo],
    ].forEach(([label, detailValue]) => {
      const cell = document.createElement("div");
      const cellLabel = document.createElement("span");
      const cellValue = document.createElement("strong");
      cell.className = "history-column";
      cellLabel.className = "history-column-label";
      cellLabel.textContent = label;
      cellValue.className = "history-column-value";
      cellValue.textContent = safeDisplay(detailValue, label === "Memo" ? 88 : 42);
      cell.append(cellLabel, cellValue);
      details.appendChild(cell);
    });
    receiptAction.className = "history-receipt-button";
    receiptAction.type = "button";
    receiptAction.textContent = "Receipt";
    summary.append(title, meta, details);
    row.append(summary, receiptAction);
    row.addEventListener("click", async () => {
      await selectTransaction(item.hash);
    });
    receiptAction.addEventListener("click", async event => {
      event.stopPropagation();
      await generateAndDownloadReceipt(item.hash);
    });
    historyList.appendChild(row);
  }

  loadMoreHistoryButton.hidden = visibleHistoryLimit >= allItems.length && !historyState.txNext && !historyState.transferNext;
}

function historyTone(item, accounting) {
  if (accounting?.category === "swap") return "swap";
  if (item.kind === "token" && item.direction === "incoming") return "incoming-token";
  if (item.kind === "token" && item.direction === "outgoing") return "outgoing-token";
  return "neutral";
}

async function selectTransaction(txHash) {
  txInput.value = txHash;
  setQaContext(`Selected ${currentNetwork().name} tx: ${shortHash(txHash)}`);
  setTxActionStatus(`Selected ${currentNetwork().name} tx: ${shortHash(txHash)}. You can add memo, mark category, download receipt, or export the row.`, "neutral");
  setStatus("Transaction selected. Receipt context is being prepared.", "neutral");
  await generateReceipt(txHash, { download: false, quiet: true });
}

async function loadHistory({ more = false } = {}) {
  const wallet = currentTargetAddress();
  if (!wallet) {
    setHistoryStatus("Connect a wallet or enter an address first.", "error");
    return;
  }

  try {
    if (currentNetwork().family === "solana") {
      await loadSolanaHistory({ more });
      return;
    }
    if (!more) {
      visibleHistoryLimit = PAGE_SIZE;
    }
    setHistoryStatus(more ? `Loading older ${currentNetwork().name} activity...` : `Loading latest ${currentNetwork().name} activity...`);
    const txParams = more ? pageParamsToQuery(historyState.txNext) : null;
    const transferParams = more ? pageParamsToQuery(historyState.transferNext) : null;
    const [txPayload, transferPayload] = await Promise.all([
      fetchJson(buildUrl(`/api/v2/addresses/${wallet}/transactions`, txParams)),
      fetchJson(buildUrl(`/api/v2/addresses/${wallet}/token-transfers`, transferParams)),
    ]);

    historyState.transactions = more
      ? [...historyState.transactions, ...(txPayload.items || [])]
      : txPayload.items || [];
    historyState.transfers = more
      ? [...historyState.transfers, ...(transferPayload.items || [])]
      : transferPayload.items || [];
    historyState.txNext = txPayload.next_page_params || null;
    historyState.transferNext = transferPayload.next_page_params || null;
    if (more) {
      visibleHistoryLimit += PAGE_SIZE;
    }
    renderHistory();
  } catch (error) {
    loadMoreHistoryButton.hidden = true;
    setHistoryStatus(error instanceof Error ? error.message : "Could not load wallet history.", "error");
  }
}

async function loadSolanaHistory({ more = false } = {}) {
  const wallet = currentTargetAddress();
  if (!wallet) {
    setHistoryStatus("Connect a wallet or enter an address first.", "error");
    return;
  }
  if (!more) {
    visibleHistoryLimit = PAGE_SIZE;
  }
  setHistoryStatus(more ? "Loading older Solana activity..." : "Loading latest Solana activity...");
  let before = more ? historyState.txNext : undefined;
  const signatures = [];
  let hasMore = false;
  for (let attempt = 0; attempt < SOLANA_HISTORY_PAGE_ATTEMPTS && signatures.length < PAGE_SIZE; attempt += 1) {
    const limit = PAGE_SIZE - signatures.length;
    const params = [wallet, { limit, ...(before ? { before } : {}) }];
    const page = await solanaRpc("getSignaturesForAddress", params);
    signatures.push(...page);
    before = page.at(-1)?.signature;
    hasMore = Boolean(before && page.length === limit);
    if (!hasMore) break;
  }
  historyState.transactions = more ? [...historyState.transactions, ...signatures] : signatures;
  historyState.transfers = [];
  historyState.txNext = hasMore ? signatures.at(-1).signature : null;
  historyState.transferNext = null;
  if (more) {
    visibleHistoryLimit += PAGE_SIZE;
  }
  renderHistory();
}

function topicToAddress(topic) {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function parseTransfers(logs) {
  return logs
    .filter(log => log.topics && log.topics[0]?.toLowerCase() === TRANSFER_TOPIC && log.topics.length >= 3)
    .map(log => {
      const token = log.address.toLowerCase();
      const metadata = knownTokens[token] || { symbol: shortHash(token), decimals: 18n };
      return {
        token,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        from: topicToAddress(log.topics[1]),
        to: topicToAddress(log.topics[2]),
        amountRaw: hexToBigInt(log.data),
      };
    });
}

function normalizeExplorerTokenTransfers(payload) {
  if (!Array.isArray(payload?.items)) return [];
  return payload.items
    .filter(item => item.token_type === "ERC-20" && item.total?.value)
    .map(item => {
      const decimals = BigInt(item.total.decimals || item.token?.decimals || "18");
      const symbol = safeDisplay(item.token?.symbol || item.token_type || "TOKEN", 18);
      const amount = formatUnits(BigInt(item.total.value || "0"), decimals);
      const exchangeRate = Number(item.token?.exchange_rate || 0);
      const usdValue = Number.isFinite(exchangeRate) && exchangeRate > 0
        ? Number(amount) * exchangeRate
        : 0;
      return {
        token: String(item.token?.address_hash || "").toLowerCase(),
        symbol,
        decimals,
        from: String(item.from?.hash || "").toLowerCase(),
        to: String(item.to?.hash || "").toLowerCase(),
        amountRaw: BigInt(item.total.value || "0"),
        amount,
        usdValue,
        fromInfo: item.from || null,
        toInfo: item.to || null,
        tokenName: safeDisplay(item.token?.name || symbol, 32),
      };
    });
}

async function fetchExplorerTokenTransfers(txHash) {
  const network = currentNetwork();
  if (!network.blockscoutUrl) return [];
  try {
    const payload = await fetchJson(buildUrl(`/api/v2/transactions/${txHash}/token-transfers`));
    return normalizeExplorerTokenTransfers(payload);
  } catch {
    return [];
  }
}

function normalizeExplorerInternalTransfers(payload) {
  if (!Array.isArray(payload?.items)) return [];
  return payload.items
    .map(item => ({
      from: String(item.from?.hash || item.from || "").toLowerCase(),
      to: String(item.to?.hash || item.to || "").toLowerCase(),
      value: String(item.value || item.amount || "0"),
      fromInfo: typeof item.from === "object" ? item.from : null,
      toInfo: typeof item.to === "object" ? item.to : null,
    }))
    .filter(item => item.from && item.to && item.value !== "0");
}

async function fetchExplorerInternalTransfers(txHash) {
  const network = currentNetwork();
  if (!network.blockscoutUrl) return [];
  try {
    const payload = await fetchJson(buildUrl(`/api/v2/transactions/${txHash}/internal-transactions`));
    return normalizeExplorerInternalTransfers(payload);
  } catch {
    return [];
  }
}

function summarizeTransfers(tx, transfers) {
  const sender = tx.from.toLowerCase();
  const sent = transfers.filter(item => item.from === sender && item.to !== ZERO_ADDRESS);
  const received = transfers.filter(item => item.to === sender && item.from !== ZERO_ADDRESS);

  return {
    sent,
    received,
    firstSent: sent[0],
    firstReceived: received[0],
  };
}

function transferText(item, fallback) {
  if (!item) return fallback;
  return `${formatUnits(item.amountRaw, item.decimals)} ${item.symbol}`;
}

function usdText(item) {
  if (!item?.usdValue) return "";
  if (item.usdValue < 0.01) return "~$0.01";
  return `~$${item.usdValue.toFixed(2)}`;
}

function addressName(info) {
  if (!info) return "";
  const implementation = Array.isArray(info.implementations) ? info.implementations[0]?.name : "";
  return safeDisplay(info.ens_domain_name || info.name || implementation || "", 24);
}

function addressRole(address, sender, appAddress, info = null) {
  if (!address) return "unknown";
  if (address === ZERO_ADDRESS) return "mint/burn";
  if (sameAddress(address, sender)) return "your wallet";
  if (appAddress && sameAddress(address, appAddress)) return "app/router";
  const name = addressName(info);
  if (name) return name;
  if (info?.is_contract) return "contract";
  return "protocol address";
}

function transferLabel(item, sender) {
  if (item.from === ZERO_ADDRESS) return "Token minted";
  if (item.to === ZERO_ADDRESS) return "Token burned";
  if (item.from === sender) return "Wallet sent";
  if (item.to === sender) return "Wallet received";
  return "Protocol moved";
}

function transferDetail(item, sender, appAddress = "") {
  if (!item) return "";
  const fromRole = addressRole(item.from, sender, appAddress, item.fromInfo);
  const toRole = addressRole(item.to, sender, appAddress, item.toInfo);
  const fiat = usdText(item);
  const path = `${fromRole} -> ${toRole} (${shortHash(item.from)} -> ${shortHash(item.to)})`;
  return fiat ? `${fiat}; ${path}` : path;
}

function inferMethod(tx) {
  if (!tx.input || tx.input === "0x") return "native transfer";
  return `${tx.input.slice(0, 10)} call`;
}

function observedTransferRows(transfers, sender, appAddress, existingRows, maxRows = 4) {
  const used = new Set(existingRows.map(row => `${row.value}:${row.detail}`));
  const rows = [];

  for (const item of transfers) {
    const row = {
      label: transferLabel(item, sender),
      value: transferText(item, "Token transfer"),
      detail: transferDetail(item, sender, appAddress),
    };
    const key = `${row.value}:${row.detail}`;
    if (used.has(key)) continue;
    used.add(key);
    rows.push(row);
    if (rows.length >= maxRows) break;
  }

  return rows;
}

function internalTransferRows(transfers, sender, appAddress, maxRows = 2) {
  return transfers.slice(0, maxRows).map(item => {
    const fromRole = addressRole(item.from, sender, appAddress, item.fromInfo);
    const toRole = addressRole(item.to, sender, appAddress, item.toInfo);
    return {
      label: item.to === sender ? "Native received" : item.from === sender ? "Native sent" : "Internal native",
      value: `${formatUnits(BigInt(item.value), ETH_DECIMALS, 8)} ETH`,
      detail: `${fromRole} -> ${toRole} (${shortHash(item.from)} -> ${shortHash(item.to)})`,
    };
  });
}

async function fetchQrDataUrl(value) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=184x184&margin=1&data=${encodeURIComponent(value)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("QR service unavailable");
  const contentType = response.headers.get("content-type") || "";
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (!contentType.startsWith("image/png") || contentLength > MAX_QR_BYTES) {
    throw new Error("QR service returned an invalid image");
  }
  const blob = await response.blob();
  if (blob.size > MAX_QR_BYTES || blob.type !== "image/png") {
    throw new Error("QR service returned an invalid image");
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function inferTitle(summary, tx) {
  if (summary.firstSent && summary.firstReceived) {
    return `${summary.firstSent.symbol} to ${summary.firstReceived.symbol} activity`;
  }

  if (summary.firstSent) return `${summary.firstSent.symbol} transfer`;
  if (hexToBigInt(tx.value) > 0n) return "ETH transfer";
  return `${currentNetwork().name} transaction`;
}

function inferReceiptPurpose(summary, tx, transfers) {
  if (summary.firstSent && summary.firstReceived) return "Swap / exchange record";
  if (summary.firstSent || hexToBigInt(tx.value) > 0n) return "Payment / transfer proof";
  if (transfers.length) return "Token movement record";
  return "Contract interaction record";
}

function evidenceText(network, block) {
  return `${network.name} block ${block || "pending"}; explorer QR and full tx hash included`;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function generateReceiptId({ chainId, network, txHash, ownerWallet }) {
  const source = `${String(chainId)}:${String(txHash || "").toLowerCase()}:${String(ownerWallet || "").toLowerCase()}`;
  const hash = (await sha256Hex(source)).slice(0, 24).toUpperCase();
  return `TXR-${String(network || "UNKNOWN").toUpperCase()}-${hash}`;
}

async function buildReceiptFromChain(txHash, tx, txReceipt, block, explorerTransfers = [], internalTransfers = []) {
  const network = currentNetwork();
  const transfers = explorerTransfers.length ? explorerTransfers : parseTransfers(txReceipt.logs || []);
  const summary = summarizeTransfers(tx, transfers);
  const gasFeeWei = hexToBigInt(txReceipt.gasUsed) * hexToBigInt(txReceipt.effectiveGasPrice || tx.gasPrice);
  const ethValue = hexToBigInt(tx.value);
  const success = txReceipt.status === "0x1";
  const sender = tx.from.toLowerCase();
  const appAddress = tx.to || "";
  const explorerUrl = `${network.explorerUrl}/tx/${txHash}`;

  const sentText = summary.firstSent
    ? transferText(summary.firstSent, "Observed token transfer")
    : ethValue > 0n
      ? `${formatUnits(ethValue, ETH_DECIMALS)} ETH`
      : "No direct asset sent";

  const receivedText = summary.firstReceived
    ? transferText(summary.firstReceived, "Observed token transfer")
    : transfers.length
      ? `${transfers.length} token movement${transfers.length === 1 ? "" : "s"}`
      : "No token receipt detected";

  const baseRows = [
    {
      label: "User paid",
      value: sentText,
      detail: summary.firstSent ? transferDetail(summary.firstSent, sender, appAddress) : "Native value or contract call",
    },
    {
      label: "User received",
      value: receivedText,
      detail: summary.firstReceived
        ? transferDetail(summary.firstReceived, sender, appAddress)
        : transfers.length
          ? "No direct wallet receipt; token path listed below"
          : "No direct wallet receipt",
    },
    {
      label: "Gas paid",
      value: `${formatUnits(gasFeeWei, ETH_DECIMALS, 8)} ETH`,
      detail: `${network.name} network fee`,
    },
  ];
  const observedRows = observedTransferRows(transfers, sender, appAddress, baseRows, 4);
  const internalRows = internalTransferRows(internalTransfers, sender, appAddress, 2);
  const primaryTransferCount = Number(Boolean(summary.firstSent))
    + Number(Boolean(summary.firstReceived && summary.firstReceived !== summary.firstSent));
  const undisplayedTransferCount = Math.max(transfers.length - primaryTransferCount - observedRows.length, 0);
  const blockNumber = String(parseInt(txReceipt.blockNumber, 16));
  const receiptId = await generateReceiptId({
    chainId: network.decimalChainId || network.chainId || network.id,
    network: network.name,
    txHash,
    ownerWallet: tx.from,
  });

  return {
    id: receiptId,
    title: inferTitle(summary, tx),
    purpose: inferReceiptPurpose(summary, tx, transfers),
    counterparty: tx.to ? `${shortHash(tx.to)} contract` : "Contract creation",
    accountingNote: `${sentText} paid; ${receivedText} received; ${formatUnits(gasFeeWei, ETH_DECIMALS, 8)} ETH network fee`,
    evidence: evidenceText(network, blockNumber),
    app: tx.to ? shortHash(tx.to) : "Contract creation",
    network: network.name,
    date: block?.timestamp
      ? new Date(Number(hexToBigInt(block.timestamp)) * 1000).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "Block timestamp unavailable",
    tx: shortHash(txHash),
    fullTxHash: txHash,
    from: shortHash(tx.from),
    fromFull: tx.from,
    toFull: tx.to || "Contract creation",
    sent: sentText,
    received: receivedText,
    gas: `${formatUnits(gasFeeWei, ETH_DECIMALS, 8)} ETH`,
    appFee: summary.sent.length > 1 ? "Detected in transfers" : "Not detected",
    protocolFee: "Not detected",
    status: success ? "Verified" : "Failed",
    explorerUrl,
    block: blockNumber,
    method: inferMethod(tx),
    transferRows: [
      ...baseRows,
      ...internalRows,
      ...observedRows,
      ...(undisplayedTransferCount > 0
        ? [{
            label: "Other transfers",
            value: `${undisplayedTransferCount} observed`,
            detail: "Potential router, fee, or protocol movement",
          }]
        : []),
    ],
  };
}

function lamportsToSol(lamports) {
  return `${formatUnits(BigInt(Math.max(Number(lamports || 0), 0)), 9n, 9)} SOL`;
}

async function buildSolanaReceipt(signature, tx) {
  const network = currentNetwork();
  const meta = tx?.meta || {};
  const message = tx?.transaction?.message || {};
  const accountKeys = message.accountKeys || [];
  const signer = accountKeys[0]?.pubkey || accountKeys[0] || connectedWallet;
  const fee = meta.fee || 0;
  const failed = Boolean(meta.err);
  const blockTime = tx?.blockTime ? new Date(tx.blockTime * 1000) : null;
  const explorerUrl = `${network.explorerUrl}/tx/${signature}`;
  const receiptId = await generateReceiptId({
    chainId: network.cluster || network.id,
    network: network.name,
    txHash: signature,
    ownerWallet: signer,
  });
  return {
    id: receiptId,
    title: "Solana transaction",
    purpose: "Wallet activity record",
    counterparty: "Solana program interaction",
    accountingNote: `Network fee ${lamportsToSol(fee)}; status ${failed ? "failed" : "confirmed"}`,
    evidence: evidenceText(network, String(tx?.slot || "pending")),
    app: safeDisplay(signer, 44),
    network: network.name,
    date: blockTime
      ? blockTime.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : "Block timestamp unavailable",
    tx: shortHash(signature),
    fullTxHash: signature,
    from: shortHash(signer),
    fromFull: signer,
    toFull: "Solana program interaction",
    sent: "Program interaction",
    received: failed ? "Failed" : "Confirmed",
    gas: lamportsToSol(fee),
    status: failed ? "Failed" : "Verified",
    explorerUrl,
    block: String(tx?.slot || "Pending"),
    method: "solana transaction",
    transferRows: [
      { label: "Signer", value: shortHash(signer), detail: "Wallet that authorized the transaction" },
      { label: "Network fee", value: lamportsToSol(fee), detail: `${network.name} fee paid in lamports` },
      { label: "Instructions", value: `${message.instructions?.length || 0}`, detail: "Program instructions observed" },
      { label: "Status", value: failed ? "Failed" : "Confirmed", detail: failed ? "Transaction returned an error" : "Transaction finalized by RPC" },
    ],
  };
}

function setWallet(address, chainId) {
  connectedWallet = address || null;
  const chainLabel = currentNetwork().family === "solana" ? currentNetwork().name : `chain ${parseInt(chainId || "0x0", 16)}`;
  walletLabel.textContent = address ? `${shortHash(address)} - ${chainLabel}` : "Not connected";
  connectWalletButton.textContent = address ? "Disconnect" : "Connect wallet";
  if (address && currentNetwork().family === "evm" && billingWalletInput && !billingWalletInput.value.trim()) {
    billingWalletInput.value = address;
  }
  if (connectedWallet) {
    setTargetAddress(connectedWallet, { load: false, persist: true });
    loadHistory();
  } else {
    walletProvider = null;
    syncTargetAddressInput();
    if (currentTargetAddress() && validAddressForCurrentNetwork(currentTargetAddress())) {
      loadHistory();
    } else {
      resetHistory();
    }
  }
}

function selectedProvider() {
  const family = currentNetwork().family;
  const selectedInfo = selectedWalletInfo();
  const selectedCompatible = selectedInfo?.family === family;
  const provider = selectedCompatible ? window.TxReceiptsWallets?.get(walletProviderSelect.value) : null;
  const fallback = window.TxReceiptsWallets?.firstByFamily(family)
    || (family === "evm" ? window.ethereum : window.solana);
  return provider || walletProvider || fallback || null;
}

function resetHistory() {
  historyState = { transactions: [], transfers: [], txNext: null, transferNext: null };
  visibleHistoryLimit = PAGE_SIZE;
  renderHistory();
}

function compactReceipt() {
  if (!receipt) return null;
  return {
    id: receipt.id,
    network: receipt.network,
    title: receipt.title,
    purpose: receipt.purpose,
    status: receipt.status,
    sent: receipt.sent,
    received: receipt.received,
    gas: receipt.gas,
    app: receipt.app,
    method: receipt.method,
    date: receipt.date,
    tx: receipt.fullTxHash,
    rows: Array.isArray(receipt.transferRows) ? receipt.transferRows.slice(0, 8) : [],
  };
}

function parseAmount(value) {
  const match = String(value || "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function walletReportItems() {
  return normalizedHistoryItems().filter(item => item.kind === "tx" || item.kind === "token");
}

function buildMonthlyReport() {
  const items = walletReportItems();
  const ledgerItems = items.map(item => ({ ...item, accounting: accountingMetaForItem(item) }));
  const outgoing = ledgerItems.filter(item => item.accounting.direction === "expense");
  const incoming = ledgerItems.filter(item => item.accounting.direction === "income");
  const swaps = ledgerItems.filter(item => item.accounting.category === "swap");
  const subscriptions = ledgerItems.filter(item => item.accounting.category === "subscription");
  const appFees = ledgerItems.filter(item => item.accounting.category === "app_fee");
  const protocolFees = ledgerItems.filter(item => item.accounting.category === "protocol_fee");
  const uncategorized = ledgerItems.filter(item => item.accounting.category === "uncategorized");
  const verified = ledgerItems.filter(item => item.accounting.status === "verified");
  const needsReview = ledgerItems.filter(item => item.accounting.direction === "unknown" || item.accounting.category === "uncategorized" || item.accounting.status === "failed");
  const weeklyFees = buildWeeklyFeeSummary();
  const byTitle = new Map();
  for (const item of ledgerItems) {
    const key = item.title || "Unknown activity";
    byTitle.set(key, (byTitle.get(key) || 0) + 1);
  }
  const top = [...byTitle.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    network: currentNetwork().name,
    wallet: currentTargetAddress() || "Not selected",
    totalRecords: items.length,
    outgoingCount: outgoing.length,
    incomingCount: incoming.length,
    tokenRecords: items.filter(item => item.kind === "token").length,
    needsReviewCount: needsReview.length,
    swapCount: swaps.length,
    subscriptionCount: subscriptions.length,
    appFeeCount: appFees.length,
    protocolFeeCount: protocolFees.length,
    appFeeTotal: appFees.reduce((sum, item) => sum + parseAmount(item.value), 0),
    protocolFeeTotal: protocolFees.reduce((sum, item) => sum + parseAmount(item.value), 0),
    weeklyFeeRecords: weeklyFees.records,
    weeklyFeeTotal: weeklyFees.total,
    weeklyFeeAsset: weeklyFees.asset,
    uncategorizedCount: uncategorized.length,
    verifiedReceiptCount: verified.length,
    totalIncomeRows: incoming.length,
    totalExpenseRows: outgoing.length,
    appProtocolFeeStatus: `${appFees.length} app / ${protocolFees.length} protocol rows`,
    estimatedOutgoingValue: outgoing.reduce((sum, item) => sum + parseAmount(item.value), 0),
    estimatedIncomeValue: incoming.reduce((sum, item) => sum + parseAmount(item.value), 0),
    largestExpenseRows: [...outgoing].sort((left, right) => parseAmount(right.value) - parseAmount(left.value)).slice(0, 5),
    topActivity: top ? `${top[0]} (${top[1]} records)` : "Not available",
    items: ledgerItems,
  };
}

function itemTimestampMs(item) {
  if (item.timestamp) {
    const timestamp = new Date(item.timestamp).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  if (item.blockTime) {
    const timestamp = Number(item.blockTime) * 1000;
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

function formatUtcDateTime(value) {
  const timestamp = new Date(value || Date.now());
  if (!Number.isFinite(timestamp.getTime())) return "Time unavailable";
  const year = timestamp.getUTCFullYear();
  const month = String(timestamp.getUTCMonth() + 1).padStart(2, "0");
  const day = String(timestamp.getUTCDate()).padStart(2, "0");
  const hours = String(timestamp.getUTCHours()).padStart(2, "0");
  const minutes = String(timestamp.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

function formatMonthYearTr(value) {
  const timestamp = new Date(value || Date.now());
  if (!Number.isFinite(timestamp.getTime())) return "This month";
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(timestamp);
}

function titleCaseLabel(value) {
  return String(value || "")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function transactionTypeLabel(direction) {
  if (direction === "income") return "Gelir";
  if (direction === "expense") return "Gider";
  if (direction === "transfer") return "Transfer";
  return "İnceleme Gerekli";
}

function transactionCategoryLabel(category) {
  const labels = {
    gas_fee: "Gas Fee",
    swap: "Swap",
    subscription: "Subscription",
    app_fee: "App Fee",
    protocol_fee: "Protocol Fee",
    purchase: "Purchase",
    sales: "Sales",
    internal_transfer: "Internal Transfer",
    uncategorized: "Kategori Bekliyor",
  };
  return labels[String(category || "")] || titleCaseLabel(category || "İşlem");
}

function transactionStatusLabel(status) {
  const normalized = String(status || "").toLowerCase();
  if (["verified", "success", "successful", "ok"].includes(normalized)) return "Başarılı";
  if (["failed", "error"].includes(normalized)) return "Başarısız";
  if (["pending", "queued"].includes(normalized)) return "Beklemede";
  return titleCaseLabel(normalized || "bilinmiyor");
}

function parseAssetValueParts(value) {
  const match = String(value || "").trim().match(/(-?\d+(?:[\.,]\d+)?)\s*([A-Za-z0-9._-]{2,16})$/);
  if (!match) return null;
  return {
    amount: Number(match[1].replace(",", ".")),
    symbol: match[2].toUpperCase(),
  };
}

function dominantTokenSymbol(report) {
  const totals = new Map();
  for (const item of report.items.filter(entry => entry.kind === "token")) {
    const parts = parseAssetValueParts(item.value);
    if (!parts) continue;
    totals.set(parts.symbol, (totals.get(parts.symbol) || 0) + Math.abs(parts.amount));
  }
  return [...totals.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || null;
}

function tokenFlowTotal(report, direction, symbol) {
  return report.items
    .filter(item => item.kind === "token" && item.accounting.direction === direction)
    .reduce((sum, item) => {
      const parts = parseAssetValueParts(item.value);
      if (!parts || parts.symbol !== symbol) return sum;
      return sum + parts.amount;
    }, 0);
}

function transactionUserAnswer(data, selectedLedgerItem) {
  const lines = [
    `This transaction occurred on ${currentNetwork().name} at ${formatUtcDateTime(data?.date)}.`,
    "",
    `Transaction type: ${transactionTypeLabel(selectedLedgerItem?.accounting.direction)}`,
    `Category: ${transactionCategoryLabel(selectedLedgerItem?.accounting.category)}`,
  ];
  if (data?.gas && data.gas !== "Not available") lines.push(`Gas paid: ${data.gas}`);
  if (selectedLedgerItem?.usdValue) lines.push(`Estimated USD value: ${usdText({ usdValue: selectedLedgerItem.usdValue }).replace(/^~/, "")}`);
  lines.push(`Status: ${transactionStatusLabel(data?.status)}`);
  if (data?.id) lines.push(`Receipt ID: ${data.id}`);
  return lines.join("\n");
}

function monthlyUserAnswer(report) {
  const latestTimestamp = report.items[0]?.timestamp || Date.now();
  const symbol = dominantTokenSymbol(report);
  const incomingTotal = symbol ? tokenFlowTotal(report, "income", symbol) : 0;
  const outgoingTotal = symbol ? tokenFlowTotal(report, "expense", symbol) : 0;
  const gasLine = report.weeklyFeeRecords
    ? `${report.weeklyFeeTotal} ${report.weeklyFeeAsset}`
    : "No loaded fee data";
  return [
    `${formatMonthYearTr(latestTimestamp)} ${report.network} wallet summary:`,
    "",
    `Total incoming: ${symbol ? `${incomingTotal.toFixed(2)} ${symbol}` : "Insufficient token data"}`,
    `Total outgoing: ${symbol ? `${outgoingTotal.toFixed(2)} ${symbol}` : "Insufficient token data"}`,
    `Gas fees: ${gasLine}`,
    `Swap transactions: ${report.swapCount}`,
    `Rows marked as business expense: ${report.items.filter(item => item.accounting.direction === "expense" && item.accounting.category !== "internal_transfer").length}`,
    `Rows pending categorization: ${report.uncategorizedCount}`,
    `Verified receipts: ${report.verifiedReceiptCount}`,
    "",
    "Prepare the CSV and PDF summary for the accountant.",
  ].join("\n");
}

function sortableItemValue(item) {
  return Math.abs(parseAmount(item.value));
}

function summarizedLedgerRow(item) {
  return {
    date: item.timestamp || "",
    title: item.title,
    type: item.kind,
    value: item.value,
    numericValue: sortableItemValue(item),
    direction: item.accounting.direction,
    category: item.accounting.category,
    status: item.accounting.status,
    tx: item.hash,
  };
}

function buildQuestionAnalysis(report) {
  const last30DaysSince = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30DayItems = report.items.filter(item => itemTimestampMs(item) >= last30DaysSince);
  const rankedRows = last30DayItems
    .filter(item => sortableItemValue(item) > 0)
    .sort((left, right) => sortableItemValue(right) - sortableItemValue(left));
  const recentTransactions = [...report.items]
    .sort((left, right) => itemTimestampMs(right) - itemTimestampMs(left))
    .slice(0, 10);

  return {
    last30DayRecordCount: last30DayItems.length,
    topTransactions30d: rankedRows.slice(0, 10).map(summarizedLedgerRow),
    topExpenseTransactions30d: rankedRows
      .filter(item => item.accounting.direction === "expense")
      .slice(0, 10)
      .map(summarizedLedgerRow),
    topIncomeTransactions30d: rankedRows
      .filter(item => item.accounting.direction === "income")
      .slice(0, 10)
      .map(summarizedLedgerRow),
    recentTransactions: recentTransactions.map(item => ({
      ...summarizedLedgerRow(item),
      timestampMs: itemTimestampMs(item),
      feeValue: item.fee?.value || item.transaction_fee || item.tx_fee || "",
      gasUsed: item.gas_used || item.gasUsed || item.gas || "",
      gasPrice: item.gas_price || item.gasPrice || "",
    })),
  };
}

function blockscoutFeeWei(item) {
  const direct = item.fee?.value || item.transaction_fee || item.tx_fee;
  if (direct && /^\d+$/.test(String(direct))) return BigInt(direct);
  const gasUsed = item.gas_used || item.gasUsed || item.gas;
  const gasPrice = item.gas_price || item.gasPrice;
  if (/^\d+$/.test(String(gasUsed || "")) && /^\d+$/.test(String(gasPrice || ""))) {
    return BigInt(gasUsed) * BigInt(gasPrice);
  }
  return 0n;
}

function buildWeeklyFeeSummary() {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (currentNetwork().family === "solana") {
    const rows = historyState.transactions.filter(item => {
      const timestamp = item.blockTime ? item.blockTime * 1000 : 0;
      return timestamp >= since && Number.isFinite(Number(item.fee));
    });
    const totalLamports = rows.reduce((sum, item) => sum + BigInt(item.fee || 0), 0n);
    return { records: rows.length, total: lamportsToSol(totalLamports), asset: "SOL" };
  }

  const rows = historyState.transactions.filter(item => {
    const timestamp = item.timestamp ? new Date(item.timestamp).getTime() : 0;
    return timestamp >= since && blockscoutFeeWei(item) > 0n;
  });
  const totalWei = rows.reduce((sum, item) => sum + blockscoutFeeWei(item), 0n);
  return { records: rows.length, total: formatUnits(totalWei, ETH_DECIMALS, 8), asset: currentNetwork().nativeCurrency?.symbol || "ETH" };
}

function updateAccountingPanel() {
  const report = buildMonthlyReport();
  if (accountingScope) {
    accountingScope.textContent = currentTargetAddress()
      ? `${currentNetwork().name} only. Wallet ${shortHash(currentTargetAddress())}. ${report.totalRecords} loaded records ready for review.`
      : `Connect a wallet or use an address to prepare a ${currentNetwork().name} report.`;
  }
  if (accountingOutgoing) accountingOutgoing.textContent = String(report.outgoingCount);
  if (accountingIncoming) accountingIncoming.textContent = String(report.incomingCount);
  if (accountingTokens) accountingTokens.textContent = String(report.tokenRecords);
  if (accountingReview) accountingReview.textContent = report.totalRecords ? `${report.needsReviewCount} rows` : "Pending";
  if (accountingPeriod) accountingPeriod.textContent = `Period: ${report.totalRecords ? "current loaded activity" : "waiting for wallet data"}`;
  if (accountingExceptions) {
    accountingExceptions.textContent = report.totalRecords
      ? `Exceptions: ${report.needsReviewCount} uncategorized or failed rows`
      : "Exceptions: connect wallet or use address";
  }
  if (accountingExports) {
    accountingExports.textContent = report.totalRecords
      ? "Exports: CSV for Excel, print view for PDF"
      : "Exports: CSV and PDF ready after loading";
  }
  if (monthlyIncome) monthlyIncome.textContent = String(report.totalIncomeRows);
  if (monthlyExpenses) monthlyExpenses.textContent = String(report.totalExpenseRows);
  if (monthlyGasFees) monthlyGasFees.textContent = `${report.weeklyFeeTotal} ${report.weeklyFeeAsset}`;
  if (monthlyAppFees) monthlyAppFees.textContent = report.appProtocolFeeStatus;
  if (monthlySwaps) monthlySwaps.textContent = String(report.swapCount);
  if (monthlySubscriptions) monthlySubscriptions.textContent = String(report.subscriptionCount);
  if (monthlyUncategorized) monthlyUncategorized.textContent = String(report.uncategorizedCount);
  if (monthlyVerified) monthlyVerified.textContent = String(report.verifiedReceiptCount);
}

function selectedTxText() {
  const tx = receipt?.fullTxHash || txInput?.value.trim() || "";
  return tx ? shortHash(tx) : "No transaction selected";
}

function receiptMatchesInput() {
  const txHash = txInput?.value.trim();
  return Boolean(txHash && receipt?.fullTxHash === txHash);
}

function accountingBlock(title, rows) {
  return [
    `Accounting report - ${title}`,
    `Network: ${currentNetwork().name}`,
    `Transaction: ${selectedTxText()}`,
    ...rows.map(([label, value]) => `${label}: ${value || "Not available"}`),
  ].join("\n");
}

function deterministicBlock(title, rows, fieldsUsed) {
  return [
    accountingBlock(title, rows),
    fieldsUsed ? `Fields used: ${fieldsUsed}` : "",
  ].filter(Boolean).join("\n");
}

function parseRequestedTransactionCount(question) {
  const text = String(question || "").toLowerCase();
  const digitMatch = text.match(/(?:top|last|son|en)\s*(\d{1,2})/i) || text.match(/(\d{1,2})\s*(?:transactions?|islem|işlem|tx)/i);
  if (digitMatch) return Math.max(1, Math.min(99, Number(digitMatch[1])));
  if (/last transaction|son islem|son işlem/.test(text)) return 1;
  return 3;
}

function isRecentTransactionFeeQuestion(question) {
  const text = String(question || "").toLowerCase();
  const mentionsTransactions = /(last|son|recent|latest).*(transaction|transactions|islem|işlem|tx)|(transaction|transactions|islem|işlem|tx).*(last|son|recent|latest)/.test(text);
  const mentionsFees = /fee|fees|gas|ucret|ücret|komisyon|masraf/.test(text);
  return mentionsTransactions && mentionsFees;
}

function parseQuestionMonthWindow(question) {
  const text = String(question || "").toLowerCase();
  if (/(bu ay|this month|monthly)/.test(text)) return 1;
  const monthMatch = text.match(/(?:son|last)\s*(\d{1,2})\s*ay/)
    || text.match(/(?:son|last)\s*(\d{1,2})\s*months?/)
    || text.match(/(\d{1,2})\s*ay/)
    || text.match(/(\d{1,2})\s*months?/);
  if (monthMatch) return Math.max(1, Math.min(24, Number(monthMatch[1])));
  return 1;
}

function parseQuestionTimeWindow(question) {
  const text = String(question || "").toLowerCase();
  if (/(bugün|today)/.test(text)) return { unit: "days", value: 1 };
  if (/(bu hafta|this week|weekly|haftalık)/.test(text)) return { unit: "days", value: 7 };
  if (/(bu ay|this month|monthly)/.test(text)) return { unit: "months", value: 1 };

  const weekMatch = text.match(/(?:son|last)\s*(\d{1,2})\s*hafta/)
    || text.match(/(\d{1,2})\s*hafta/)
    || text.match(/(?:last)\s*(\d{1,2})\s*weeks?/)
    || text.match(/(\d{1,2})\s*weeks?/);
  if (weekMatch) return { unit: "days", value: Math.max(1, Math.min(52, Number(weekMatch[1]))) * 7 };

  const dayMatch = text.match(/(?:son|last)\s*(\d{1,2})\s*g[uü]n/)
    || text.match(/(\d{1,2})\s*g[uü]n/)
    || text.match(/(?:last)\s*(\d{1,2})\s*days?/)
    || text.match(/(\d{1,2})\s*days?/);
  if (dayMatch) return { unit: "days", value: Math.max(1, Math.min(90, Number(dayMatch[1]))) };

  return { unit: "months", value: parseQuestionMonthWindow(text) };
}

function parseNativeAssetFlow(question) {
  const text = String(question || "").toLowerCase();
  const mentionsAsset = /(eth|base|native)/.test(text);
  const asksIncoming = /(aldim|aldım|aldim\b|al\b|receive|received|incoming|gelen|geldi|gelmis|gelmiş)/.test(text);
  const asksOutgoing = /(gonderdim|gönderdim|gonder|gönder|sent|send|outgoing|giden|gitti|cikti|çıktı)/.test(text);
  if (!mentionsAsset || (!asksIncoming && !asksOutgoing)) return null;
  return {
    direction: asksIncoming && !asksOutgoing ? "incoming" : "outgoing",
    window: parseQuestionTimeWindow(text),
  };
}

function detectIntent(question) {
  const text = String(question || "").toLowerCase();
  if (isRecentTransactionFeeQuestion(text)) return "RECENT_TRANSACTION_FEES";
  if (parseNativeAssetFlow(text)) return "NATIVE_ASSET_FLOW";
  if (/(bu ay|this month|monthly|ay).*(eth|base|native).*(gonder|gönder|sent|send)|(eth|base|native).*(gonder|gönder|sent|send).*(bu ay|this month|monthly|ay)/.test(text)) {
    return "MONTHLY_NATIVE_SENT";
  }
  const rules = [
    ["WALLET_SUMMARY", ["wallet summary", "summarize this wallet", "wallet report", "cuzdan", "cuzdani ozetle"]],
    ["WEEKLY_FEES", ["son 1 hafta", "son bir hafta", "1 haftada", "bir haftada", "last 7", "last week", "weekly fee", "weekly gas", "feeleri", "fee'leri"]],
    ["BUSINESS_EXPENSE", ["business expense", "isletme gideri", "mark as business"]],
    ["APP_FEES", ["app fee", "app fees", "uygulama ucreti", "uygulama ücreti", "platform fee"]],
    ["PROTOCOL_FEES", ["protocol fee", "protocol fees", "router fee", "bridge fee"]],
    ["SUBSCRIPTIONS", ["subscription", "subscriptions", "abonelik", "abonelikler"]],
    ["INCOME_EXPENSE", ["income or expense", "gelir mi", "gider mi", "income", "expense"]],
    ["GAS_FEE", ["gas", "fee", "gaz", "ücret", "ucret", "komisyon", "masraf"]],
    ["TOKEN_TRANSFERS", ["token", "transfer", "swap", "ne aldım", "ne aldim", "ne gönderdim", "ne gonderdim"]],
    ["TRANSACTION_STATUS", ["başarılı", "basarili", "failed", "success", "status", "durum", "onaylandı", "onaylandi"]],
    ["VERIFY_RECEIPT", ["verified", "doğrulandı", "dogrulandi", "güvenli", "guvenli", "intent"]],
    ["MONTHLY_SPENDING", ["ay", "month", "monthly", "harcadım", "harcadim", "spend", "spent", "toplam"]],
    ["LARGEST_EXPENSES", ["largest expenses", "largest expense", "biggest expenses", "en buyuk gider", "en büyük gider", "top expenses"]],
    ["DAPP_USAGE", ["dapp", "app", "uygulama", "most", "en çok", "en cok"]],
    ["UNCATEGORIZED", ["uncategorized", "kategori", "kategorisiz", "review", "inceleme"]],
    ["ACCOUNTANT_SUMMARY", ["accountant", "muhasebeci", "summary", "ozet", "rapor hazirla"]],
    ["DOWNLOAD_RECEIPT", ["download", "indir", "pdf", "excel", "csv", "rapor"]],
    ["TOP_TRANSACTIONS", ["top 3", "top 5", "highest", "largest", "biggest", "en yüksek", "en buyuk", "en büyük", "sirala", "sırala"]],
    ["EXPLAIN_TRANSACTION", ["what happened", "ne oldu", "açıkla", "acikla", "explain", "özet", "ozet"]],
  ];
  if (text.includes("tx summary") || text.includes("transaction summary") || text.includes("summarize this transaction")) {
    return "EXPLAIN_TRANSACTION";
  }
  return rules.find(([, keywords]) => keywords.some(keyword => text.includes(keyword)))?.[0] || "UNKNOWN";
}

function templateAnswer(intent) {
  const data = compactReceipt();
  const report = buildMonthlyReport();
  const selectedLedgerItem = report.items.find(item => item.hash === txInput?.value.trim());
  const questionText = arguments[1] || "";
  if (intent === "WALLET_SUMMARY") {
    return deterministicBlock("wallet summary", [
      ["Scope", currentNetworkScopeText()],
      ["Wallet", report.wallet],
      ["Loaded records", report.totalRecords],
      ["Outgoing records", report.outgoingCount],
      ["Incoming records", report.incomingCount],
      ["Token records", report.tokenRecords],
      ["Rows needing review", report.needsReviewCount],
      ["Income rows", report.totalIncomeRows],
      ["Expense rows", report.totalExpenseRows],
      ["Uncategorized rows", report.uncategorizedCount],
      ["Verified records", report.verifiedReceiptCount],
      ["Top visible activity", report.topActivity],
    ], "loaded rows, accounting direction, accounting category, verification status, network scope");
  }
  if (intent === "MONTHLY_SPENDING") {
    return monthlyUserAnswer(report);
  }
  if (intent === "BUSINESS_EXPENSE") {
    if (!selectedLedgerItem) {
      return deterministicBlock("business expense", [
        ["Status", "Select a transaction row or paste a tx hash first"],
        ["Data availability", "Ledger row is not available yet"],
      ], "selected ledger row category, direction, memo override, verification status");
    }
    const isBusinessExpense = selectedLedgerItem.accounting.direction === "expense" && selectedLedgerItem.accounting.category !== "internal_transfer";
    return deterministicBlock("business expense", [
      ["Transaction", shortHash(selectedLedgerItem.hash)],
      ["Business expense", isBusinessExpense ? "Yes, expense candidate" : "No, needs review"],
      ["Category", selectedLedgerItem.accounting.category],
      ["Memo", selectedLedgerItem.accounting.memo],
    ], "selected ledger row category, direction, memo override, verification status");
  }
  if (intent === "APP_FEES") {
    const rows = report.items.filter(item => item.accounting.category === "app_fee");
    return deterministicBlock("app fees", [
      ["Scope", currentNetworkScopeText()],
      ["App fee rows", rows.length],
      ["Estimated app fee total", report.appFeeTotal.toFixed(6)],
      ["Review list", rows.slice(0, 5).map(item => `${shortHash(item.hash)} ${item.value}`).join("; ") || "No app fee rows in loaded activity"],
    ], "loaded rows classified as app_fee, numeric row values, current network scope");
  }
  if (intent === "PROTOCOL_FEES") {
    const rows = report.items.filter(item => item.accounting.category === "protocol_fee");
    return deterministicBlock("protocol fees", [
      ["Scope", currentNetworkScopeText()],
      ["Protocol fee rows", rows.length],
      ["Estimated protocol fee total", report.protocolFeeTotal.toFixed(6)],
      ["Review list", rows.slice(0, 5).map(item => `${shortHash(item.hash)} ${item.value}`).join("; ") || "No protocol fee rows in loaded activity"],
    ], "loaded rows classified as protocol_fee, numeric row values, current network scope");
  }
  if (intent === "SUBSCRIPTIONS") {
    const rows = report.items.filter(item => item.accounting.category === "subscription");
    return deterministicBlock("subscription rows", [
      ["Scope", currentNetworkScopeText()],
      ["Subscription rows", rows.length],
      ["Estimated subscription total", rows.reduce((sum, item) => sum + parseAmount(item.value), 0).toFixed(6)],
      ["Review list", rows.slice(0, 5).map(item => `${formatDate(item.timestamp)} ${shortHash(item.hash)} ${item.value}`).join("; ") || "No subscription rows in loaded activity"],
    ], "loaded rows classified as subscription, numeric row values, timestamps, tx hashes");
  }
  if (intent === "LARGEST_EXPENSES") {
    return deterministicBlock("largest expenses", [
      ["Scope", currentNetworkScopeText()],
      ["Rows reviewed", report.totalExpenseRows],
      ["Top expenses", report.largestExpenseRows.map(item => `${shortHash(item.hash)} ${item.value}`).join("; ") || "No expense rows in loaded activity"],
    ], "loaded expense rows, numeric values, timestamps, tx hashes");
  }
  if (intent === "NATIVE_ASSET_FLOW") {
    const flow = parseNativeAssetFlow(questionText);
    const window = flow?.window || { unit: "months", value: 1 };
    const direction = flow?.direction || "outgoing";
    const asset = currentNetwork().nativeCurrency?.symbol || "ETH";
    const since = new Date();
    if (window.unit === "days") {
      since.setTime(Date.now() - window.value * 24 * 60 * 60 * 1000);
    } else if (window.value === 1) {
      since.setDate(1);
      since.setHours(0, 0, 0, 0);
    } else {
      since.setMonth(since.getMonth() - window.value);
    }
    const matchingRows = report.items
      .filter(item => item.kind === "tx" && item.direction === direction)
      .filter(item => itemTimestampMs(item) >= since.getTime())
      .filter(item => String(item.value || "").includes(` ${asset}`));
    const totalAmount = matchingRows.reduce((sum, item) => sum + parseAmount(item.value), 0);
    const directionLabel = direction === "incoming" ? "received" : "sent";
    const windowLabel = window.unit === "days"
      ? (window.value === 7 ? "last 7 days" : `last ${window.value} days`)
      : (window.value === 1 ? "this month" : `last ${window.value} months`);
    return deterministicBlock(`${windowLabel} ${asset} ${directionLabel}`, [
      ["Scope", currentNetworkScopeText()],
      ["Wallet", report.wallet],
      ["Transactions reviewed", matchingRows.length],
      [`Total ${asset}`, `${totalAmount.toFixed(8)} ${asset}`],
      ["Accounting note", matchingRows.length ? `Calculated from loaded ${direction} native transfers for ${windowLabel}.` : `No loaded ${asset} transfers were found for ${windowLabel}.`],
    ], "loaded native transfer rows, direction, blockchain timestamp, native asset value");
  }
  if (intent === "MONTHLY_NATIVE_SENT") {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const asset = currentNetwork().nativeCurrency?.symbol || "ETH";
    const monthlyNativeRows = report.items
      .filter(item => item.kind === "tx" && item.direction === "outgoing")
      .filter(item => itemTimestampMs(item) >= monthStart.getTime())
      .filter(item => String(item.value || "").includes(` ${asset}`));
    const totalSent = monthlyNativeRows.reduce((sum, item) => sum + parseAmount(item.value), 0);
    return deterministicBlock(`monthly ${asset} sent`, [
      ["Scope", currentNetworkScopeText()],
      ["Wallet", report.wallet],
      ["Transactions reviewed", monthlyNativeRows.length],
      ["Total native asset sent", `${totalSent.toFixed(8)} ${asset}`],
      ["Accounting note", monthlyNativeRows.length ? `Calculated from outgoing native-value transactions loaded for this calendar month.` : `No outgoing ${asset} value transfers are loaded for this calendar month.`],
    ], "loaded outgoing native-value transaction rows for the current calendar month, transaction timestamps, network native asset values");
  }
  if (intent === "WEEKLY_FEES") {
    return deterministicBlock("last 7 days gas fees", [
      ["Scope", currentNetworkScopeText()],
      ["Wallet", report.wallet],
      ["Loaded fee rows", report.weeklyFeeRecords],
      ["Estimated gas paid", `${report.weeklyFeeTotal} ${report.weeklyFeeAsset}`],
      ["Accounting note", report.weeklyFeeRecords ? "Calculated from loaded transaction fee fields." : "No fee fields are available in the loaded rows yet."],
    ], "loaded transaction fee fields from the last 7 days on the current network");
  }
  if (intent === "RECENT_TRANSACTION_FEES") {
    const count = parseRequestedTransactionCount(questionText);
    const recentTransactionItems = [...report.items]
      .filter(item => item.kind === "tx")
      .sort((left, right) => itemTimestampMs(right) - itemTimestampMs(left))
      .slice(0, count);

    if (!recentTransactionItems.length) {
      return deterministicBlock("recent transaction fees", [
        ["Status", "Load wallet transactions first"],
        ["Data availability", "No recent transactions are available on the current network yet"],
      ], "recent transaction rows, transaction fee fields");
    }

    if (currentNetwork().family === "solana") {
      const totalLamports = recentTransactionItems.reduce((sum, item) => sum + BigInt(item.fee || 0), 0n);
      const detail = recentTransactionItems
        .map(item => `${shortHash(item.hash)} = ${lamportsToSol(BigInt(item.fee || 0))} SOL`)
        .join("; ");
      return deterministicBlock(`last ${recentTransactionItems.length} transaction fees`, [
        ["Transactions reviewed", recentTransactionItems.length],
        ["Total fees paid", `${lamportsToSol(totalLamports)} SOL`],
        ["Breakdown", detail],
      ], "recent transaction rows, Solana fee values, transaction hashes");
    }

    const totalWei = recentTransactionItems.reduce((sum, item) => sum + blockscoutFeeWei(item), 0n);
    const asset = currentNetwork().nativeCurrency?.symbol || "ETH";
    const detail = recentTransactionItems
      .map(item => `${shortHash(item.hash)} = ${formatUnits(blockscoutFeeWei(item), ETH_DECIMALS, 8)} ${asset}`)
      .join("; ");
    return deterministicBlock(`last ${recentTransactionItems.length} transaction fees`, [
      ["Transactions reviewed", recentTransactionItems.length],
      ["Total fees paid", `${formatUnits(totalWei, ETH_DECIMALS, 8)} ${asset}`],
      ["Breakdown", detail],
    ], "recent transaction rows, EVM fee fields, gas used, gas price, transaction hashes");
  }
  if (intent === "INCOME_EXPENSE") {
    if (!selectedLedgerItem) {
      return deterministicBlock("income or expense", [
        ["Status", "Select a transaction row or paste a tx hash first"],
        ["Data availability", "Ledger row is not available yet"],
      ], "selected ledger row direction, category, memo, verification status");
    }
    return deterministicBlock("income or expense", [
      ["Transaction", shortHash(selectedLedgerItem.hash)],
      ["Direction", selectedLedgerItem.accounting.direction],
      ["Category", selectedLedgerItem.accounting.category],
      ["Memo", selectedLedgerItem.accounting.memo],
      ["Verification status", selectedLedgerItem.accounting.status],
    ], "selected ledger row direction, category, memo, verification status");
  }
  if (intent === "DAPP_USAGE") {
    return deterministicBlock("top wallet activity", [
      ["Scope", currentNetworkScopeText()],
      ["Top visible activity", report.topActivity],
      ["Loaded records", report.totalRecords],
    ], "loaded row titles grouped by visible activity count");
  }
  if (intent === "UNCATEGORIZED") {
    const rows = report.items
      .filter(item => item.accounting.category === "uncategorized")
      .slice(0, 8)
      .map(item => `${formatDate(item.timestamp)} - ${shortHash(item.hash)} - ${item.title}`)
      .join("\n");
    return deterministicBlock("uncategorized transactions", [
      ["Scope", currentNetworkScopeText()],
      ["Uncategorized rows", report.uncategorizedCount],
      ["Review list", rows || "No uncategorized rows in the loaded activity"],
    ], "loaded rows with uncategorized category, timestamp, title, tx hash");
  }
  if (questionText === "Export accountant summary.") {
    return deterministicBlock("accountant export summary", [
      ["Scope", currentNetworkScopeText()],
      ["Wallet", report.wallet],
      ["CSV export", "Use Download CSV"],
      ["PDF export", "Use Print PDF"],
      ["Ready rows", `${report.totalRecords} loaded / ${report.needsReviewCount} need review`],
    ], "loaded records, income/expense counts, fee summaries, uncategorized count, verification count, export actions");
  }
  if (intent === "ACCOUNTANT_SUMMARY") {
    return monthlyUserAnswer(report);
  }
  if (intent === "DOWNLOAD_RECEIPT") {
    return deterministicBlock("available exports", [
      ["Excel report", "Use Download CSV"],
      ["PDF report", "Use Print PDF"],
      ["Single tx receipt", "Use Fetch receipt to download a PNG receipt"],
    ], "available export actions in the current client state");
  }
  if (intent === "GAS_FEE") {
    if (!data) {
      return deterministicBlock("missing transaction context", [
        ["Status", "Select a transaction row or paste a tx hash first"],
        ["Data availability", "Receipt data is not available yet"],
      ], "selected transaction context");
    }
    return deterministicBlock("network fee", [
      ["Status", data.status],
      ["Gas paid", data.gas],
      ["Accounting note", receipt.accountingNote],
    ], "selected receipt gas value, receipt status, accounting note");
  }
  if (intent === "TOKEN_TRANSFERS") {
    if (!data) {
      return deterministicBlock("missing transaction context", [
        ["Status", "Select a transaction row or paste a tx hash first"],
        ["Data availability", "Receipt data is not available yet"],
      ], "selected transaction context");
    }
    return deterministicBlock("token movement", [
      ["Sent", data.sent],
      ["Received", data.received],
      ["Rows", data.rows.map(row => `${row.label}=${row.value}`).join("; ")],
    ], "selected receipt sent tokens, received tokens, rendered receipt rows");
  }
  if (intent === "TRANSACTION_STATUS" || intent === "VERIFY_RECEIPT") {
    if (!data) {
      return deterministicBlock("missing transaction context", [
        ["Status", "Select a transaction row or paste a tx hash first"],
        ["Data availability", "Receipt data is not available yet"],
      ], "selected transaction context");
    }
    return deterministicBlock("verification status", [
      ["Receipt status", data.status],
      ["Evidence", receipt.evidence],
      ["Method", data.method],
    ], "selected receipt status, evidence summary, method");
  }
  if (intent === "EXPLAIN_TRANSACTION") {
    if (!data) {
      return deterministicBlock("missing transaction context", [
        ["Status", "Select a transaction row or paste a tx hash first"],
        ["Data availability", "Receipt data is not available yet"],
      ], "selected transaction context");
    }
    return transactionUserAnswer(data, selectedLedgerItem);
  }
  return null;
}

function isInScopeAccountingQuestion(question) {
  const text = String(question || "").toLowerCase();
  if (!text) return false;
  if (READY_QUESTION_SET.has(String(question || "").trim())) return true;
  if (/0x[a-f0-9]{32,}/i.test(text)) return true;

  const accountingTerms = [
    "wallet",
    "transaction",
    "tx",
    "receipt",
    "ledger",
    "accounting",
    "reconcile",
    "reconciliation",
    "export",
    "csv",
    "pdf",
    "income",
    "expense",
    "fee",
    "gas",
    "sent",
    "send",
    "eth",
    "base",
    "token",
    "transfer",
    "swap",
    "bridge",
    "dapp",
    "protocol",
    "verified",
    "uncategorized",
    "merchant",
    "invoice",
    "memo",
    "category",
    "report",
    "summary",
    "highest",
    "largest",
    "biggest",
    "rank",
    "top",
    "cuzdan",
    "cüzdan",
    "islem",
    "işlem",
    "makbuz",
    "on muhasebe",
    "ön muhasebe",
    "muhasebe",
    "mutabakat",
    "gelir",
    "gider",
    "gonder",
    "gönder",
    "gonderdim",
    "gönderdim",
    "ucret",
    "ücret",
    "komisyon",
    "kategori",
    "dogrul",
    "doğrul",
    "rapor",
    "ozet",
    "özet",
    "sirala",
    "sırala",
    "en yuksek",
    "en yüksek",
    "en buyuk",
    "en büyük",
  ];

  if (accountingTerms.some(term => text.includes(term))) return true;

  const selectedTxSignals = [
    "what happened",
    "why",
    "how",
    "which",
    "who",
    "when",
    "where",
    "how much",
    "how many",
    "explain",
    "analyse",
    "analyze",
    "neden",
    "nasıl",
    "hangi",
    "kim",
    "kime",
    "kimden",
    "nereye",
    "nereden",
    "ne",
    "ne kadar",
    "kaç",
    "açıkla",
    "acikla",
    "incele",
    "detay",
  ];
  return Boolean((txInput?.value.trim() || receipt?.fullTxHash) && selectedTxSignals.some(signal => text.includes(signal)));
}

function logQuestion(question, intent, source) {
  const logs = JSON.parse(localStorage.getItem(QUESTION_LOG_KEY) || "[]");
  logs.push({
    userQuestion: question,
    matchedIntent: intent,
    answerSource: source,
    receiptType: receipt?.purpose || "wallet_report",
    language: /[çğıöşü]/i.test(question) ? "tr" : "unknown",
    helpful: null,
    network: currentNetwork().name,
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem(QUESTION_LOG_KEY, JSON.stringify(logs.slice(-100)));
}

addMemoButton?.addEventListener("click", () => {
  const txHash = txInput?.value.trim();
  if (!txHash) {
    setTxActionStatus("Select a transaction before adding a memo.", "error");
    return;
  }
  const currentMemo = getAccountingOverride(txHash)?.memo || "";
  const memo = window.prompt("Add accounting memo", currentMemo);
  if (memo === null) return;
  setAccountingOverride(txHash, { memo: memo.trim() });
  renderHistory();
  setTxActionStatus(`Memo saved for ${shortHash(txHash)}.`, "success");
});

markBusinessExpenseButton?.addEventListener("click", () => {
  const txHash = txInput?.value.trim();
  if (!txHash) {
    setTxActionStatus("Select a transaction before marking business expense.", "error");
    return;
  }
  setAccountingOverride(txHash, { category: "purchase", direction: "expense", memo: "Marked as business expense" });
  renderHistory();
  setTxActionStatus(`Marked ${shortHash(txHash)} as business expense.`, "success");
});

markInternalTransferButton?.addEventListener("click", () => {
  const txHash = txInput?.value.trim();
  if (!txHash) {
    setTxActionStatus("Select a transaction before marking internal transfer.", "error");
    return;
  }
  setAccountingOverride(txHash, { category: "internal_transfer", direction: "transfer", memo: "Marked as internal transfer" });
  renderHistory();
  setTxActionStatus(`Marked ${shortHash(txHash)} as internal transfer.`, "success");
});

downloadReceiptButton?.addEventListener("click", async () => {
  const txHash = txInput?.value.trim();
  if (!txHash) {
    setTxActionStatus("Select a transaction before downloading a receipt.", "error");
    return;
  }
  await generateAndDownloadReceipt(txHash);
  setTxActionStatus(`Receipt downloaded for ${shortHash(txHash)}.`, "success");
});

exportRowButton?.addEventListener("click", () => {
  const item = selectedLedgerItem();
  if (!item) {
    setTxActionStatus("Select a loaded transaction row before exporting.", "error");
    return;
  }
  exportLedgerRow(item);
  setTxActionStatus(`Exported accounting row for ${shortHash(item.hash)}.`, "success");
});

async function compactAccountingContext() {
  const report = buildMonthlyReport();
  const selectedTx = txInput?.value.trim() || null;
  const selectedLedgerRow = report.items.find(item => item.hash === selectedTx) || null;
  const balances = await walletBalanceSnapshot().catch(() => null);
  return {
    network: currentNetwork().name,
    scope: currentNetworkScopeText(),
    wallet: currentTargetAddress() || null,
    selectedTx,
    balances,
    report: {
      totalRecords: report.totalRecords,
      outgoingCount: report.outgoingCount,
      incomingCount: report.incomingCount,
      tokenRecords: report.tokenRecords,
      needsReviewCount: report.needsReviewCount,
      weeklyFeeRecords: report.weeklyFeeRecords,
      weeklyFeeTotal: report.weeklyFeeTotal,
      weeklyFeeAsset: report.weeklyFeeAsset,
      totalIncomeRows: report.totalIncomeRows,
      totalExpenseRows: report.totalExpenseRows,
      uncategorizedCount: report.uncategorizedCount,
      verifiedReceiptCount: report.verifiedReceiptCount,
      appProtocolFeeStatus: report.appProtocolFeeStatus,
      topActivity: report.topActivity,
    },
    analysis: buildQuestionAnalysis(report),
    selectedReceipt: compactReceipt(),
    selectedLedgerRow: selectedLedgerRow ? {
      date: selectedLedgerRow.timestamp || "",
      type: selectedLedgerRow.kind,
      title: selectedLedgerRow.title,
      subtitle: selectedLedgerRow.subtitle,
      direction: selectedLedgerRow.accounting.direction,
      category: selectedLedgerRow.accounting.category,
      status: selectedLedgerRow.accounting.status,
      memo: selectedLedgerRow.accounting.memo,
      value: selectedLedgerRow.value,
      tx: selectedLedgerRow.hash,
      feeValue: selectedLedgerRow.fee?.value || selectedLedgerRow.transaction_fee || selectedLedgerRow.tx_fee || "",
      gasUsed: selectedLedgerRow.gas_used || selectedLedgerRow.gasUsed || selectedLedgerRow.gas || "",
      gasPrice: selectedLedgerRow.gas_price || selectedLedgerRow.gasPrice || "",
    } : null,
    rows: report.items.slice(0, 40).map(item => ({
      date: item.timestamp || "",
      type: item.kind,
      title: item.title,
      direction: item.accounting.direction,
      category: item.accounting.category,
      status: item.accounting.status,
      memo: item.accounting.memo,
      value: item.value,
      tx: item.hash,
    })),
  };
}

async function answerQuestion(question, options = {}) {
  const normalizedQuestion = String(question || "").trim();
  const intent = detectIntent(normalizedQuestion);
  const preferTemplate = Boolean(options.preferTemplate || READY_QUESTION_SET.has(normalizedQuestion));

  if (!isInScopeAccountingQuestion(normalizedQuestion)) {
    logQuestion(normalizedQuestion, intent, "blocked");
    return {
      answer: `${currentNetworkScopeText()}\nAI only answers onchain pre-accounting questions about the current network's wallet activity, transactions, fees, token movements, categories, exports, and reconciliation.`,
      source: "policy",
    };
  }

  if (preferTemplate) {
    const answer = templateAnswer(intent, normalizedQuestion);
    if (answer) {
      logQuestion(normalizedQuestion, intent, "template");
      return { answer, source: "template" };
    }
  }

  try {
    const context = await compactAccountingContext();
    const response = await apiFetch(`/v1/ai/accounting-answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: normalizedQuestion, context }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `AI API returned HTTP ${response.status}`);
    logQuestion(normalizedQuestion, intent, "ai");
    return { answer: payload.answer || "AI could not prepare an answer.", source: "ai" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI fallback is unavailable.";
    logQuestion(normalizedQuestion, intent, "ai_failed");
    return {
      answer: `${currentNetworkScopeText()}\nAI could not answer right now. ${message}`,
      source: "ai",
    };
  }
}

async function downloadMonthlyCsv() {
  const report = buildMonthlyReport();
  const csvReceiptIds = await Promise.all(report.items.map(async item => {
    if (!item.hash || !currentTargetAddress()) return "";
    return generateReceiptId({
      chainId: currentNetwork().decimalChainId || currentNetwork().chainId || currentNetwork().id,
      network: currentNetwork().name,
      txHash: item.hash,
      ownerWallet: currentTargetAddress(),
    });
  }));
  const rows = [
    ["network", report.network],
    ["wallet", report.wallet],
    ["total_records", report.totalRecords],
    ["outgoing_records", report.outgoingCount],
    ["incoming_records", report.incomingCount],
    ["rows_needing_review", report.needsReviewCount],
    ["income_rows", report.totalIncomeRows],
    ["expense_rows", report.totalExpenseRows],
    ["uncategorized_rows", report.uncategorizedCount],
    ["verified_records", report.verifiedReceiptCount],
    ["gas_fees_native", `${report.weeklyFeeTotal} ${report.weeklyFeeAsset}`],
    [],
    ["Date", "Network", "Receipt ID", "Tx Hash", "Direction", "Category", "Counterparty", "Value", "Gas Native", "App Fee USD", "Protocol Fee USD", "Memo", "Verification Status"],
    ...report.items.map((item, index) => [
      item.timestamp || "",
      report.network,
      csvReceiptIds[index],
      item.hash,
      item.accounting.direction,
      item.accounting.category,
      item.subtitle,
      item.value,
      "",
      "",
      "",
      item.accounting.memo,
      item.accounting.status,
    ]),
  ];
  const csv = rows
    .map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `txreceipts-${currentNetwork().id}-wallet-report.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function printMonthlyReport() {
  const report = buildMonthlyReport();
  setQaAnswer(`${currentNetworkScopeText()}\nWallet: ${report.wallet}\nLoaded records: ${report.totalRecords}\nIncome rows: ${report.totalIncomeRows}\nExpense rows: ${report.totalExpenseRows}\nGas fees: ${report.weeklyFeeTotal} ${report.weeklyFeeAsset}\nUncategorized: ${report.uncategorizedCount}\nVerified records: ${report.verifiedReceiptCount}\nTop activity: ${report.topActivity}`, "template");
  window.print();
}

function populateNetworks() {
  const previousValue = networkSelect.value;
  networkSelect.textContent = "";
  networks.forEach(network => {
    const option = document.createElement("option");
    option.value = network.id;
    option.textContent = network.name;
    networkSelect.appendChild(option);
  });
  networkSelect.value = networks.some(network => network.id === previousValue) ? previousValue : networks[0]?.id || "";
}

function populateWalletProviders({ preserveSelection = true } = {}) {
  const previousValue = walletProviderSelect.value;
  walletProviderSelect.textContent = "";
  const network = currentNetwork();
  const options = walletOptions();
  const compatible = options.filter(wallet => wallet.family === network.family);
  if (!options.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No wallet found";
    walletProviderSelect.appendChild(option);
    return;
  }
  if (!compatible.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = `No ${network.family} wallet found`;
    walletProviderSelect.appendChild(option);
    return;
  }
  compatible.forEach(wallet => {
    const option = document.createElement("option");
    option.value = wallet.id;
    option.textContent = mobileWalletOption(wallet.id)
      ? `${wallet.name} (${wallet.family}, open app)`
      : `${wallet.name} (${wallet.family})`;
    walletProviderSelect.appendChild(option);
  });
  const previousStillValid = preserveSelection && compatible.some(wallet => wallet.id === previousValue);
  const preferred = compatible.find(wallet => normalizeWalletLabel(wallet.name).includes("metamask"));
  walletProviderSelect.value = previousStillValid ? previousValue : (preferred || compatible[0]).id;
}

function syncNetworkToSelectedWallet({ preserveNetwork = false } = {}) {
  const info = selectedWalletInfo();
  if (!info) return;
  if (preserveNetwork && info.family === currentNetwork().family) return;
  const targetNetwork = networkByFamily(info.family);
  if (targetNetwork && networkSelect.value !== targetNetwork.id) {
    networkSelect.value = targetNetwork.id;
    populateWalletProviders();
    resetHistory();
  }
}

function syncWalletToSelectedNetwork() {
  const network = currentNetwork();
  const info = selectedWalletInfo();
  if (info?.family === network.family) return;
  const replacement = window.TxReceiptsWallets?.firstInfoByFamily(network.family);
  if (replacement) {
    walletProviderSelect.value = replacement.id;
  }
}

async function ensureSelectedNetwork(provider) {
  if (!provider) throw new Error("No injected wallet found.");
  const network = currentNetwork();
  if (network.family === "solana") {
    return network.cluster || "mainnet-beta";
  }
  const chainId = await provider.request({ method: "eth_chainId" });
  if (chainId === network.chainId) {
    return chainId;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: network.chainId }],
    });
  } catch (error) {
    if (error && error.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: network.chainId,
            chainName: network.name,
            nativeCurrency: network.nativeCurrency,
            rpcUrls: networkRpcUrls(network),
            blockExplorerUrls: [network.explorerUrl],
          },
        ],
      });
    } else {
      throw error;
    }
  }

  return provider.request({ method: "eth_chainId" });
}

connectWalletButton.addEventListener("click", async () => {
  try {
    if (connectedWallet) {
      if (currentNetwork().family === "solana" && walletProvider?.disconnect) {
        await walletProvider.disconnect();
      }
      setWallet(null, "0x0");
      setStatus("Wallet disconnected locally.", "success");
      return;
    }

    const provider = selectedProvider();
    const info = selectedWalletInfo();
    if (!provider) {
      const launchUrl = info ? mobileWalletLaunchUrl(info.id) : null;
      if (launchUrl) {
        setStatus(`Opening ${info.name}. Continue inside the wallet app to connect.`, "neutral");
        window.location.href = launchUrl;
        return;
      }
      setStatus("No injected wallet found. Open this page inside MetaMask, Coinbase Wallet, Trust Wallet, Phantom, or another compatible wallet.", "error");
      return;
    }

    walletProvider = provider;
    syncNetworkToSelectedWallet({ preserveNetwork: true });
    if (info?.family === "solana") {
      const response = await provider.connect();
      const address = response?.publicKey?.toString()
        || response?.account?.address
        || provider.publicKey?.toString()
        || provider.publicKey?.toBase58?.();
      if (!address) throw new Error("Could not read Phantom Solana public key.");
      setWallet(address, currentNetwork().cluster);
      setStatus(`Wallet connected and ${currentNetwork().name} selected.`, "success");
      return;
    }

    if (provider.request) {
      try {
        await provider.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch (error) {
        if (error?.code !== -32601 && error?.code !== 4100) throw error;
      }
    }
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const chainId = await ensureSelectedNetwork(provider);
    setWallet(accounts[0], chainId);
    setStatus(`Wallet connected and ${currentNetwork().name} selected.`, "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not connect wallet.", "error");
  }
});

targetAddressForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const address = targetAddressInput?.value.trim() || "";
  if (!validAddressForCurrentNetwork(address)) {
    setHistoryStatus(currentNetwork().family === "solana" ? "Enter a valid Solana address." : "Enter a valid 0x wallet address.", "error");
    return;
  }
  setTargetAddress(address, { load: false, persist: true });
  setStatus(`Using ${shortHash(address)} on ${currentNetwork().name}.`, "success");
  await loadHistory();
});

loadMoreHistoryButton.addEventListener("click", () => {
  const allItems = allHistoryItems();
  if (visibleHistoryLimit < allItems.length) {
    visibleHistoryLimit += PAGE_SIZE;
    renderHistory();
    return;
  }
  loadHistory({ more: true });
});

historyTabs.forEach(tabButton => {
  tabButton.addEventListener("click", () => {
    activeHistoryTab = tabButton.dataset.historyTab;
    visibleHistoryLimit = PAGE_SIZE;
    historyTabs.forEach(button => button.classList.toggle("active", button === tabButton));
    renderHistory();
  });
});

networkSelect.addEventListener("change", async () => {
  populateWalletProviders({ preserveSelection: false });
  syncWalletToSelectedNetwork();
  syncTargetAddressInput();
  resetHistory();
  txStatus.textContent = `Selected ${currentNetwork().name}. Paste a tx hash, connect a wallet, or use an address.`;
  if (currentTargetAddress() && validAddressForCurrentNetwork(currentTargetAddress())) {
    loadHistory();
  }
  if (!connectedWallet || !walletProvider) return;
  if (currentNetwork().family === "solana") {
    loadHistory();
    return;
  }
  try {
    const chainId = await ensureSelectedNetwork(walletProvider);
    setWallet(connectedWallet, chainId);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not switch wallet network.", "error");
  }
});

walletProviderSelect.addEventListener("change", () => {
  syncNetworkToSelectedWallet({ preserveNetwork: false });
  setWallet(null, "0x0");
  setStatus("Wallet provider changed. Connect again to approve access.", "neutral");
});

checkCreditsButton?.addEventListener("click", async () => {
  const inputs = requireApiAuthInputs();
  if (!inputs) return;
  setCreditStatus("Checking API request balance...");
  try {
    const response = await apiFetch(`/v1/projects/${encodeURIComponent(inputs.projectId)}/credits`, {
      headers: { Authorization: `Bearer ${inputs.apiKey}` },
    });
    if (!response.ok) throw new Error(`API returned HTTP ${response.status}`);
    const payload = await response.json();
    creditBalance.textContent = `${Number(payload.totalAvailable || 0)} requests`;
    setCreditStatus(
      `Free left: ${Number(payload.freeRemaining || 0)}/${Number(payload.freeAllowance || 0)}. Paid balance: ${Number(payload.paidBalance || 0)} requests. Receipt records: ${Number(payload.receipts || 0)}.`,
      "success"
    );
  } catch (error) {
    creditBalance.textContent = "Unavailable";
    setCreditStatus(error instanceof Error ? error.message : "Could not load API request balance.", "error");
  }
});

createTopUpButton?.addEventListener("click", async () => {
  const inputs = requireApiAuthInputs();
  if (!inputs) return;
  const amountUsdc = topUpAmountInput.value.trim();
  const billingWallet = billingWalletInput.value.trim();
  if (!amountUsdc || !billingWallet) {
    setCreditStatus("Enter a Base USDC amount and sender wallet.", "error");
    return;
  }
  setCreditStatus("Creating Base USDC top-up intent...");
  if (topUpInstructions) topUpInstructions.hidden = true;
  try {
    const response = await apiFetch(`/v1/credits/topups`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inputs.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amountUsdc, billingWallet }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `API returned HTTP ${response.status}`);
    if (topUpInstructions) {
      topUpInstructions.hidden = false;
      topUpInstructions.textContent = [
        `Send exactly ${payload.amountUsdc} USDC on Base.`,
        `From: ${payload.billingWallet}`,
        `To: ${payload.receivingAddress}`,
        `Payment ID: ${payload.paymentId}`,
        `Paid requests after confirmation: +${payload.creditAmount}`,
      ].join("\n");
    }
    setCreditStatus("Top-up created. The watcher adds paid requests after the Base USDC transfer confirms.", "success");
  } catch (error) {
    setCreditStatus(error instanceof Error ? error.message : "Could not create top-up.", "error");
  }
});

quickQuestionButtons.forEach(button => {
  const question = String(button.dataset.question || button.textContent || "").trim();
  const metadata = READY_QUESTION_METADATA[question];
  if (metadata) {
    button.title = metadata;
    button.setAttribute("aria-description", metadata);
  }
  button.addEventListener("click", async () => {
    const question = button.dataset.question || button.textContent;
    if (qaQuestionInput) qaQuestionInput.value = question;
    if (metadata) setQaContext(metadata);
    const txHash = txInput?.value.trim();
    if (txHash && !receiptMatchesInput()) {
      setQaContext(`Preparing ${currentNetwork().name} tx: ${shortHash(txHash)}`);
      await generateReceipt(txHash, { download: false, quiet: true });
    }
    const result = await answerQuestion(question, { preferTemplate: true });
    setQaAnswer(result.answer, result.source);
  });
});

qaForm?.addEventListener("submit", event => {
  event.preventDefault();
  (async () => {
  const question = qaQuestionInput?.value.trim() || "";
  if (!question) {
    setQaAnswer("Ask a question or use one of the ready questions.", "template");
    return;
  }
  setQaLoading(true);
  setQaAnswer(`Searching ${currentNetwork().name} activity...`, "loading");
  try {
    const txHash = txInput?.value.trim();
    if (txHash && !receiptMatchesInput()) {
      setQaContext(`Preparing ${currentNetwork().name} tx: ${shortHash(txHash)}`);
      await generateReceipt(txHash, { download: false, quiet: true });
    }
    const result = await answerQuestion(question, { preferTemplate: false });
    setQaAnswer(result.answer, result.source);
  } finally {
    setQaLoading(false);
  }
  })();
});

downloadMonthlyCsvButton?.addEventListener("click", downloadMonthlyCsv);
printMonthlyReportButton?.addEventListener("click", printMonthlyReport);

window.addEventListener("txreceipts:walletsChanged", () => {
  populateWalletProviders();
});

if (window.ethereum) {
  window.ethereum.on?.("accountsChanged", async accounts => {
    if (!accounts || !accounts[0]) {
      setWallet(null, "0x0");
      return;
    }
    try {
      const provider = walletProvider || selectedProvider();
      const chainId = provider ? await provider.request({ method: "eth_chainId" }) : "0x0";
      setWallet(accounts[0], chainId);
    } catch {
      setWallet(accounts[0], "0x0");
    }
  });

  window.ethereum.on?.("chainChanged", chainId => {
    const network = networks.find(item => item.chainId === chainId);
    if (network && networkSelect.value !== network.id) {
      networkSelect.value = network.id;
      resetHistory();
    }
    const current = walletLabel.textContent.split(" - ")[0];
    walletLabel.textContent = `${current} - chain ${parseInt(chainId, 16)}`;
  });
}

txForm.addEventListener("submit", async event => {
  event.preventDefault();
  const txHash = txInput.value.trim();
  await generateReceipt(txHash, { download: true });
});

txInput.addEventListener("input", () => {
  if (!receiptMatchesInput()) {
    setQaContext(txInput.value.trim() ? `Pending tx: ${shortHash(txInput.value.trim())}` : "No transaction selected yet.");
  }
});

async function generateReceipt(txHash, { download = false, quiet = false } = {}) {
  const network = currentNetwork();
  const isValidHash = network.family === "solana"
    ? /^[1-9A-HJ-NP-Za-km-z]{64,96}$/.test(txHash)
    : /^0x[a-fA-F0-9]{64}$/.test(txHash);
  if (!isValidHash) {
    setStatus(network.family === "solana" ? "Enter a valid Solana transaction signature." : "Enter a valid 0x transaction hash.", "error");
    return;
  }

  try {
    if (network.family === "solana") {
      await generateSolanaReceipt(txHash, { download, quiet });
      return;
    }
    if (!quiet) setStatus(`Fetching transaction from ${network.name} RPC...`);
    const [tx, txReceipt] = await Promise.all([
      rpc("eth_getTransactionByHash", [txHash]),
      rpc("eth_getTransactionReceipt", [txHash]),
    ]);

    if (!tx || !txReceipt) {
      setStatus("Transaction not found on Base yet.", "error");
      return;
    }

    const [block, explorerTransfers, internalTransfers] = await Promise.all([
      rpc("eth_getBlockByNumber", [txReceipt.blockNumber, false]),
      fetchExplorerTokenTransfers(txHash),
      fetchExplorerInternalTransfers(txHash),
    ]);
    receipt = await buildReceiptFromChain(txHash, tx, txReceipt, block, explorerTransfers, internalTransfers);
    setQaContext(`Selected ${network.name} tx: ${shortHash(txHash)} - ${receipt.status}`);
    try {
      receipt.qrDataUrl = await fetchQrDataUrl(receipt.explorerUrl);
    } catch {
      receipt.qrDataUrl = "";
    }
    setStatus(`Receipt generated from ${network.name} transaction data.`, "success");
    if (download) {
      await downloadReceiptPng();
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : `Could not fetch ${network.name} transaction.`, "error");
  }
}

async function generateSolanaReceipt(signature, { download = false, quiet = false } = {}) {
  if (!quiet) setStatus("Fetching transaction from Solana RPC...");
  const tx = await solanaRpc("getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
  ]);
  if (!tx) {
    setStatus("Transaction not found on Solana yet.", "error");
    return;
  }
  receipt = await buildSolanaReceipt(signature, tx);
  setQaContext(`Selected ${network.name} tx: ${shortHash(signature)} - ${receipt.status}`);
  try {
    receipt.qrDataUrl = await fetchQrDataUrl(receipt.explorerUrl);
  } catch {
    receipt.qrDataUrl = "";
  }
  setStatus("Receipt generated from Solana transaction data.", "success");
  if (download) {
    await downloadReceiptPng();
  }
}

async function generateAndDownloadReceipt(txHash) {
  txInput.value = txHash;
  await generateReceipt(txHash, { download: true });
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function drawText(context, text, x, y, options = {}) {
  context.fillStyle = options.color || "#111412";
  context.font = `${options.weight || 500} ${options.size || 28}px ${options.family || "Inter, Arial, sans-serif"}`;
  context.textAlign = options.align || "left";
  context.fillText(safeDisplay(text, options.maxLength || 180), x, y);
}

function drawFitText(context, text, x, y, maxWidth, options = {}) {
  const size = options.size || 28;
  let maxLength = options.maxLength || 180;
  let displayText = safeDisplay(text, maxLength);
  context.fillStyle = options.color || "#111412";
  context.font = `${options.weight || 500} ${size}px ${options.family || "Inter, Arial, sans-serif"}`;
  context.textAlign = options.align || "left";

  while (context.measureText(displayText).width > maxWidth && maxLength > 6) {
    maxLength -= 1;
    displayText = safeDisplay(text, maxLength);
  }

  context.fillText(displayText, x, y);
}

function drawDivider(context, y) {
  context.strokeStyle = "#ded6cc";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(112, y);
  context.lineTo(1608, y);
  context.stroke();
}

function loadImage(src) {
  if (!src) return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function renderReceiptCanvas(data) {
  const canvas = document.createElement("canvas");
  canvas.width = RECEIPT_WIDTH;
  canvas.height = RECEIPT_HEIGHT;
  const context = canvas.getContext("2d");
  const qrImage = await loadImage(data.qrDataUrl);
  const rows = Array.isArray(data.transferRows) ? data.transferRows.slice(0, 8) : [];

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  roundedRect(context, 64, 64, 1592, 1772, 18);
  context.fillStyle = "#ffffff";
  context.fill();
  context.strokeStyle = "#ded6cc";
  context.lineWidth = 2;
  context.stroke();

  drawText(context, "TXRECEIPTS", 112, 150, { color: "#21c7bd", size: 24, weight: 800, maxLength: 24 });
  drawText(context, data.title, 112, 228, { size: 64, weight: 800, maxLength: 42 });
  drawText(context, "Purpose", 112, 278, { color: "#5c655f", size: 20, maxLength: 12 });
  drawText(context, data.purpose || "Transaction record", 212, 278, { size: 22, weight: 800, maxLength: 36 });
  drawText(context, "TxReceipts Receipt ID", 660, 278, { color: "#5c655f", size: 20, maxLength: 22 });
  drawText(context, data.id, 920, 278, { family: "ui-monospace, SFMono-Regular, Consolas, monospace", size: 22, weight: 800, maxLength: 40 });
  roundedRect(context, 1408, 114, 180, 68, 34);
  context.fillStyle = data.status === "Verified" ? "#fff0c6" : "#ffe4e4";
  context.fill();
  drawText(context, data.status, 1498, 158, {
    align: "center",
    color: data.status === "Verified" ? "#946300" : "#9f1d1d",
    size: 24,
    weight: 800,
    maxLength: 18,
  });

  drawDivider(context, 326);
  drawText(context, "Sent", 112, 405, { color: "#5c655f", size: 26 });
  drawText(context, data.sent, 112, 465, { size: 52, weight: 800, maxLength: 28 });
  drawText(context, "Received", 880, 405, { color: "#5c655f", size: 26 });
  drawFitText(context, data.received, 880, 465, 430, {
    size: String(data.received || "").length > 14 ? 38 : 46,
    weight: 800,
    maxLength: 24,
  });
  context.strokeStyle = "#ded6cc";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(680, 439);
  context.lineTo(800, 439);
  context.stroke();

  roundedRect(context, 1368, 346, 188, 188, 14);
  context.fillStyle = "#fffaf0";
  context.fill();
  context.strokeStyle = "#ded6cc";
  context.stroke();
  if (qrImage) {
    context.drawImage(qrImage, 1382, 360, 160, 160);
  } else {
    drawText(context, "Explorer", 1462, 424, { align: "center", size: 26, weight: 800, maxLength: 12 });
    drawText(context, "tx details", 1462, 464, { align: "center", color: "#5c655f", size: 20, maxLength: 12 });
  }
  drawText(context, "Scan for transaction details", 1462, 586, { align: "center", color: "#5c655f", size: 14, maxLength: 36 });

  drawDivider(context, 620);
  drawText(context, "Payment, fees, and token path", 112, 700, { size: 34, weight: 800, maxLength: 40 });
  rows.forEach((row, index) => {
    const y = 765 + index * 46;
    drawText(context, row.label, 112, y, { color: "#5c655f", size: 21, maxLength: 24 });
    drawText(context, row.value, 376, y, { size: 24, weight: 800, maxLength: 28 });
    drawText(context, row.detail, 720, y, { color: "#5c655f", size: 21, maxLength: 74 });
  });

  drawDivider(context, 1135);
  drawText(context, "Accounting and proof", 112, 1210, { size: 34, weight: 800, maxLength: 30 });
  drawText(context, "Counterparty", 112, 1275, { color: "#5c655f", size: 22 });
  drawText(context, data.counterparty || data.toFull, 280, 1275, { size: 24, weight: 800, maxLength: 42 });
  drawText(context, "Accounting note", 112, 1338, { color: "#5c655f", size: 22 });
  drawText(context, data.accountingNote || "Public onchain transaction record", 320, 1338, { size: 22, weight: 800, maxLength: 86 });
  drawText(context, "Verification", 112, 1401, { color: "#5c655f", size: 22 });
  drawText(context, data.evidence || `Verified on ${data.network}`, 280, 1401, { size: 22, weight: 800, maxLength: 88 });

  drawText(context, "Method", 112, 1480, { color: "#5c655f", size: 22 });
  drawText(context, data.method || "contract call", 240, 1480, { size: 24, weight: 800, maxLength: 28 });
  drawText(context, "Status", 560, 1480, { color: "#5c655f", size: 22 });
  drawText(context, data.status, 680, 1480, { size: 24, weight: 800, maxLength: 18 });
  drawText(context, "Time", 890, 1480, { color: "#5c655f", size: 22 });
  drawText(context, data.date, 980, 1480, { size: 24, weight: 800, maxLength: 36 });

  drawText(context, "From", 112, 1560, { color: "#5c655f", size: 22 });
  drawText(context, data.fromFull, 112, 1600, { family: "ui-monospace, SFMono-Regular, Consolas, monospace", size: 24, weight: 800, maxLength: 66 });
  drawText(context, "To", 112, 1660, { color: "#5c655f", size: 22 });
  drawText(context, data.toFull, 112, 1700, { family: "ui-monospace, SFMono-Regular, Consolas, monospace", size: 24, weight: 800, maxLength: 66 });
  drawText(context, "Tx hash", 112, 1760, { color: "#5c655f", size: 22 });
  drawText(context, data.fullTxHash, 112, 1800, { family: "ui-monospace, SFMono-Regular, Consolas, monospace", size: 24, weight: 800, maxLength: 66 });
  drawText(context, `Receipt ${data.id} - ${data.network}`, 112, 1828, { color: "#5c655f", size: 20, maxLength: 54 });
  drawText(context, `Verified on ${data.network}`, 1540, 1828, { align: "right", size: 24, weight: 800, maxLength: 28 });

  return canvas;
}

async function downloadReceiptPng() {
  if (!receipt) return;
  const canvas = await renderReceiptCanvas(receipt);
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      if (!blob) {
        setStatus("Could not create receipt PNG.", "error");
        resolve();
        return;
      }
      const pngUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = `${receipt.id || "tx-receipt"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(pngUrl);
      setStatus("Receipt PNG downloaded.", "success");
      resolve();
    }, "image/png");
  });
}

populateNetworks();
populateWalletProviders({ preserveSelection: false });
setTargetAddress(readTargetAddress(), { load: false, persist: false });
setTimeout(() => populateWalletProviders(), 300);
syncTargetAddressInput();
if (currentTargetAddress() && validAddressForCurrentNetwork(currentTargetAddress())) {
  loadHistory();
} else {
  resetHistory();
}
