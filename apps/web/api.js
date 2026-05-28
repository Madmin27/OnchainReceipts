const API_BASE_URLS = ["https://api.txreceipts.com.tr", "https://txreceipts-api.evpc77.workers.dev"];
const BASE_CHAIN_HEX = "0x2105";
const BASE_CHAIN_PARAMS = {
  chainId: BASE_CHAIN_HEX,
  chainName: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://mainnet.base.org"],
  blockExplorerUrls: ["https://basescan.org"],
};

const walletProviderSelect = document.querySelector("#apiWalletProvider");
const connectWalletButton = document.querySelector("#apiConnectWallet");
const apiWalletStatus = document.querySelector("#apiWalletStatus");
const projectIdInput = document.querySelector("#projectIdInput");
const apiKeyInput = document.querySelector("#apiKeyInput");
const checkCreditsButton = document.querySelector("#checkCredits");
const creditBalance = document.querySelector("#creditBalance");
const creditStatus = document.querySelector("#creditStatus");
const topUpAmountInput = document.querySelector("#topUpAmountInput");
const billingWalletInput = document.querySelector("#billingWalletInput");
const createTopUpButton = document.querySelector("#createTopUp");
const topUpInstructions = document.querySelector("#topUpInstructions");
const topUpStatusBadge = document.querySelector("#topUpStatusBadge");
const topUpStatusMessage = document.querySelector("#topUpStatusMessage");
const topUpStatusMeta = document.querySelector("#topUpStatusMeta");
const topUpStatusPaymentId = document.querySelector("#topUpStatusPaymentId");
const topUpStatusAmount = document.querySelector("#topUpStatusAmount");
const topUpStatusWallet = document.querySelector("#topUpStatusWallet");
const topUpStatusTxHash = document.querySelector("#topUpStatusTxHash");
const topUpHistoryStatus = document.querySelector("#topUpHistoryStatus");
const topUpHistoryBody = document.querySelector("#topUpHistoryBody");

const TOPUP_STATE_KEY = "txreceipts_api_topup_state_v1";
const TOPUP_POLL_INTERVAL_MS = 15000;

let connectedWallet = "";
let activeTopUpPoll = null;

function setWalletStatus(message, tone = "neutral") {
  if (!apiWalletStatus) return;
  apiWalletStatus.textContent = message;
  apiWalletStatus.dataset.tone = tone;
}

function setCreditStatus(message, tone = "neutral") {
  if (!creditStatus) return;
  creditStatus.textContent = message;
  creditStatus.dataset.tone = tone;
}

function setTopUpHistoryStatus(message, tone = "neutral") {
  if (!topUpHistoryStatus) return;
  topUpHistoryStatus.textContent = message;
  topUpHistoryStatus.dataset.tone = tone;
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

function evmWalletOptions() {
  return (window.TxReceiptsWallets?.list() || []).filter(wallet => wallet.family === "evm");
}

function syncWalletOptions() {
  if (!walletProviderSelect) return;
  const wallets = evmWalletOptions();
  const current = walletProviderSelect.value;
  walletProviderSelect.innerHTML = "";
  if (!wallets.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No EVM wallet found";
    walletProviderSelect.append(option);
    walletProviderSelect.disabled = true;
    connectWalletButton.disabled = true;
    return;
  }
  wallets.forEach(wallet => {
    const option = document.createElement("option");
    option.value = wallet.id;
    option.textContent = wallet.name;
    walletProviderSelect.append(option);
  });
  walletProviderSelect.disabled = false;
  connectWalletButton.disabled = false;
  if (wallets.some(wallet => wallet.id === current)) walletProviderSelect.value = current;
}

function selectedProvider() {
  return window.TxReceiptsWallets?.get(walletProviderSelect?.value) || null;
}

async function ensureBaseNetwork(provider) {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (String(chainId).toLowerCase() === BASE_CHAIN_HEX) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_HEX }],
    });
  } catch (error) {
    if (error?.code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [BASE_CHAIN_PARAMS],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_HEX }],
    });
  }
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

function readTopUpState() {
  try {
    return JSON.parse(localStorage.getItem(TOPUP_STATE_KEY) || "null");
  } catch {
    return null;
  }
}

function writeTopUpState(state) {
  localStorage.setItem(TOPUP_STATE_KEY, JSON.stringify(state));
}

function clearTopUpPolling() {
  if (!activeTopUpPoll) return;
  clearInterval(activeTopUpPoll);
  activeTopUpPoll = null;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function truncateMiddle(value, start = 8, end = 6) {
  const text = String(value || "");
  if (!text) return "-";
  if (text.length <= start + end + 3) return text;
  return `${text.slice(0, start)}...${text.slice(-end)}`;
}

function renderCurrentTopUp(topUp) {
  if (!topUpStatusBadge || !topUpStatusMessage) return;
  if (!topUp) {
    topUpStatusBadge.textContent = "No active payment";
    topUpStatusBadge.dataset.status = "idle";
    topUpStatusMessage.textContent = "Create a top-up intent to start payment tracking.";
    topUpStatusMessage.dataset.tone = "neutral";
    if (topUpStatusMeta) topUpStatusMeta.hidden = true;
    return;
  }
  const status = String(topUp.status || "waiting_for_payment");
  topUpStatusBadge.textContent = status.replaceAll("_", " ");
  topUpStatusBadge.dataset.status = status;
  const statusTone = status === "credited" ? "success" : status === "rejected" || status === "expired" ? "error" : "neutral";
  topUpStatusMessage.textContent = status === "credited"
    ? `Payment ${topUp.paymentId} was credited. Paid requests were added to the project balance.`
    : status === "expired"
      ? `Payment intent ${topUp.paymentId} expired before a matching transfer was confirmed.`
      : `Waiting for ${topUp.amountUsdc} USDC from ${truncateMiddle(topUp.billingWallet)} to ${truncateMiddle(topUp.receivingAddress)}.`;
  topUpStatusMessage.dataset.tone = statusTone;
  if (topUpStatusMeta) topUpStatusMeta.hidden = false;
  if (topUpStatusPaymentId) topUpStatusPaymentId.textContent = topUp.paymentId || "-";
  if (topUpStatusAmount) topUpStatusAmount.textContent = topUp.amountUsdc ? `${topUp.amountUsdc} USDC` : "-";
  if (topUpStatusWallet) topUpStatusWallet.textContent = truncateMiddle(topUp.billingWallet);
  if (topUpStatusTxHash) topUpStatusTxHash.textContent = truncateMiddle(topUp.txHash || "-");
}

function renderTopUpHistory(items) {
  if (!topUpHistoryBody) return;
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    topUpHistoryBody.innerHTML = "<tr><td colspan=\"6\">No top-ups yet for this project.</td></tr>";
    return;
  }
  topUpHistoryBody.innerHTML = rows.map(item => `
    <tr>
      <td>${item.paymentId}</td>
      <td><span class="status-pill api-status-pill" data-status="${item.status}">${String(item.status || "waiting_for_payment").replaceAll("_", " ")}</span></td>
      <td>${item.amountUsdc} USDC</td>
      <td>${truncateMiddle(item.billingWallet)}</td>
      <td>${formatDateTime(item.creditedAt || item.createdAt || item.expiresAt)}</td>
      <td>${item.txHash ? truncateMiddle(item.txHash) : "-"}</td>
    </tr>
  `).join("");
}

async function loadTopUpHistory(inputs, options = {}) {
  setTopUpHistoryStatus(options.silent ? topUpHistoryStatus.textContent : "Loading top-up history...");
  try {
    const response = await apiFetch("/v1/credits/topups", {
      headers: { Authorization: `Bearer ${inputs.apiKey}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `API returned HTTP ${response.status}`);
    renderTopUpHistory(payload.items || []);
    setTopUpHistoryStatus(`Loaded ${Number((payload.items || []).length)} recent top-ups.`, "success");
    return payload.items || [];
  } catch (error) {
    renderTopUpHistory([]);
    setTopUpHistoryStatus(error instanceof Error ? error.message : "Could not load top-up history.", "error");
    return [];
  }
}

async function loadTopUpStatus(inputs, paymentId, options = {}) {
  if (!paymentId) {
    renderCurrentTopUp(null);
    return null;
  }
  try {
    const response = await apiFetch(`/v1/credits/topups/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${inputs.apiKey}` },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `API returned HTTP ${response.status}`);
    renderCurrentTopUp(payload);
    if (options.persist !== false) writeTopUpState({ projectId: inputs.projectId, paymentId: payload.paymentId });
    if (payload.status !== "waiting_for_payment") clearTopUpPolling();
    return payload;
  } catch (error) {
    renderCurrentTopUp(null);
    if (!options.silent) {
      setTopUpHistoryStatus(error instanceof Error ? error.message : "Could not load payment status.", "error");
    }
    clearTopUpPolling();
    return null;
  }
}

function startTopUpPolling(inputs, paymentId) {
  clearTopUpPolling();
  if (!paymentId) return;
  activeTopUpPoll = window.setInterval(async () => {
    const topUp = await loadTopUpStatus(inputs, paymentId, { silent: true });
    if (!topUp || topUp.status !== "waiting_for_payment") {
      clearTopUpPolling();
      await loadTopUpHistory(inputs, { silent: true });
      const response = await apiFetch(`/v1/projects/${encodeURIComponent(inputs.projectId)}/credits`, {
        headers: { Authorization: `Bearer ${inputs.apiKey}` },
      }).catch(() => null);
      if (response?.ok) {
        const payload = await response.json().catch(() => ({}));
        creditBalance.textContent = `${Number(payload.totalAvailable || 0)} requests`;
      }
    }
  }, TOPUP_POLL_INTERVAL_MS);
}

async function connectWallet() {
  const provider = selectedProvider();
  if (!provider) {
    setWalletStatus("No compatible EVM wallet is available.", "error");
    return;
  }
  setWalletStatus("Connecting wallet on Base...");
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const address = String(accounts?.[0] || "").toLowerCase();
    if (!address) throw new Error("Wallet did not return an address.");
    await ensureBaseNetwork(provider);
    connectedWallet = address;
    if (billingWalletInput && !billingWalletInput.value.trim()) billingWalletInput.value = connectedWallet;
    setWalletStatus(`Connected ${address}. Billing wallet prefilled for Base USDC top-ups.`, "success");
  } catch (error) {
    setWalletStatus(error instanceof Error ? error.message : "Could not connect wallet.", "error");
  }
}

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
    const storedTopUp = readTopUpState();
    await loadTopUpHistory(inputs);
    if (storedTopUp?.projectId === inputs.projectId && storedTopUp?.paymentId) {
      const topUp = await loadTopUpStatus(inputs, storedTopUp.paymentId);
      if (topUp?.status === "waiting_for_payment") startTopUpPolling(inputs, storedTopUp.paymentId);
    }
  } catch (error) {
    creditBalance.textContent = "Unavailable";
    setCreditStatus(error instanceof Error ? error.message : "Could not load API request balance.", "error");
  }
});

createTopUpButton?.addEventListener("click", async () => {
  const inputs = requireApiAuthInputs();
  if (!inputs) return;
  const amountUsdc = topUpAmountInput.value.trim();
  const billingWallet = billingWalletInput.value.trim() || connectedWallet;
  if (!amountUsdc || !billingWallet) {
    setCreditStatus("Enter a Base USDC amount and billing wallet.", "error");
    return;
  }
  billingWalletInput.value = billingWallet;
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
    writeTopUpState({ projectId: inputs.projectId, paymentId: payload.paymentId });
    renderCurrentTopUp(payload);
    await loadTopUpHistory(inputs, { silent: true });
    startTopUpPolling(inputs, payload.paymentId);
    setCreditStatus("Top-up created. The watcher adds paid requests after the Base USDC transfer confirms.", "success");
  } catch (error) {
    setCreditStatus(error instanceof Error ? error.message : "Could not create top-up.", "error");
  }
});

connectWalletButton?.addEventListener("click", connectWallet);
walletProviderSelect?.addEventListener("change", () => {
  setWalletStatus("Wallet provider changed. Connect the selected wallet on Base.", "neutral");
});
window.addEventListener("txreceipts:walletsChanged", syncWalletOptions);

syncWalletOptions();
setWalletStatus("Choose an EVM wallet and connect it on Base.", "neutral");
renderCurrentTopUp(null);