const API_BASE_URLS = ["https://api.txreceipts.com.tr", "https://txreceipts-api.evpc77.workers.dev"];
const BASE_RPC_URL = "https://mainnet.base.org";
const BASE_CHAIN_HEX = "0x2105";
const BASE_USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const FREE_PROJECT_KEY = "txreceipts_api_credentials_v2";
const TOPUP_STATE_KEY = "txreceipts_api_topup_state_v2";
const TOPUP_POLL_INTERVAL_MS = 15000;
const STARTER_TOPUP_AMOUNT = "5";
const STARTER_TOPUP_CREDITS = 10000;
const BASE_CHAIN_PARAMS = {
  chainId: BASE_CHAIN_HEX,
  chainName: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: [BASE_RPC_URL],
  blockExplorerUrls: ["https://basescan.org"],
};

const walletProviderSelect = document.querySelector("#apiWalletProvider");
const connectWalletButton = document.querySelector("#apiConnectWallet");
const apiWalletStatus = document.querySelector("#apiWalletStatus");
const billingWalletInput = document.querySelector("#billingWalletInput");
const projectIdInput = document.querySelector("#projectIdInput");
const apiKeyInput = document.querySelector("#apiKeyInput");
const createFreeProjectButton = document.querySelector("#createFreeProject");
const checkCreditsButton = document.querySelector("#checkCredits");
const createTopUpButton = document.querySelector("#createTopUp");
const creditBalance = document.querySelector("#creditBalance");
const creditStatus = document.querySelector("#creditStatus");
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

let connectedWallet = "";
let activeTopUpPoll = null;
let lastDetectedTransfer = null;

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

async function baseRpc(method, params) {
  const response = await fetch(BASE_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!response.ok) throw new Error(`Base RPC returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "Base RPC request failed.");
  return payload.result;
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

function persistCredentials(credentials) {
  if (!credentials?.projectId || !credentials?.apiKey) return;
  localStorage.setItem(FREE_PROJECT_KEY, JSON.stringify(credentials));
}

function readStoredCredentials() {
  try {
    return JSON.parse(localStorage.getItem(FREE_PROJECT_KEY) || "null");
  } catch {
    return null;
  }
}

function hydrateCredentials(credentials) {
  if (!credentials) return;
  if (projectIdInput) projectIdInput.value = credentials.projectId || "";
  if (apiKeyInput) apiKeyInput.value = credentials.apiKey || "";
  if (billingWalletInput && !billingWalletInput.value.trim() && credentials.billingWallet) {
    billingWalletInput.value = credentials.billingWallet;
  }
}

function requireApiAuthInputs() {
  const inputs = apiAuthInputs();
  if (!inputs.projectId || !inputs.apiKey) {
    setCreditStatus("Create the free API key first, or paste your existing project ID and API key.", "error");
    return null;
  }
  persistCredentials({ ...readStoredCredentials(), ...inputs, billingWallet: billingWalletInput?.value.trim() || connectedWallet });
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
  if (!text || text === "-") return "-";
  if (text.length <= start + end + 3) return text;
  return `${text.slice(0, start)}...${text.slice(-end)}`;
}

function hexToBigInt(value) {
  const normalized = String(value || "0x0");
  return BigInt(normalized.startsWith("0x") ? normalized : `0x${normalized}`);
}

function parseUsdcUnits(amount) {
  const value = String(amount || "").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(value)) throw new Error("Invalid USDC amount.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
}

function formatUsdcUnits(units) {
  const whole = units / 1000000n;
  const fraction = (units % 1000000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function addressTopic(address) {
  return `0x${String(address || "").toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function encodeErc20Transfer(toAddress, amountUnits) {
  const selector = "a9059cbb";
  const target = String(toAddress || "").toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const amount = amountUnits.toString(16).padStart(64, "0");
  return `0x${selector}${target}${amount}`;
}

function sameAddress(left, right) {
  return String(left || "").toLowerCase() === String(right || "").toLowerCase();
}

function renderCurrentTopUp(topUp) {
  if (!topUpStatusBadge || !topUpStatusMessage) return;
  if (!topUp) {
    lastDetectedTransfer = null;
    topUpStatusBadge.textContent = "No active payment";
    topUpStatusBadge.dataset.status = "idle";
    topUpStatusMessage.textContent = "Create your free API key first. After that, one click opens the 5 USDC wallet payment.";
    topUpStatusMessage.dataset.tone = "neutral";
    if (topUpStatusMeta) topUpStatusMeta.hidden = true;
    return;
  }
  const status = String(topUp.status || "waiting_for_payment");
  const detectedTxHash = topUp.txHash || lastDetectedTransfer?.txHash || "";
  topUpStatusBadge.textContent = status.replaceAll("_", " ");
  topUpStatusBadge.dataset.status = status;
  let message = `Waiting for ${topUp.amountUsdc} USDC from ${truncateMiddle(topUp.billingWallet)} to ${truncateMiddle(topUp.receivingAddress)}.`;
  let tone = "neutral";
  if (status === "credited") {
    message = `Payment ${topUp.paymentId} was credited. ${topUp.creditAmount} paid requests were added to the project balance.`;
    tone = "success";
  } else if (status === "expired") {
    message = `Payment intent ${topUp.paymentId} expired before a matching transfer was confirmed.`;
    tone = "error";
  } else if (lastDetectedTransfer?.txHash && lastDetectedTransfer?.reasons?.includes("insufficient_confirmations")) {
    message = `Transfer ${truncateMiddle(lastDetectedTransfer.txHash)} was detected in the latest wallet-to-treasury records. Waiting for Base confirmations (${Number(lastDetectedTransfer.confirmations || 0)}/3).`;
  } else if (lastDetectedTransfer?.txHash && lastDetectedTransfer?.reasons?.includes("wallet_submitted")) {
    message = `Wallet approval was sent. Waiting for the USDC transfer to appear in the latest wallet-to-treasury records.`;
  } else if (lastDetectedTransfer?.txHash) {
    message = `Transfer ${truncateMiddle(lastDetectedTransfer.txHash)} was detected. Waiting for the credit check to complete.`;
  }
  topUpStatusMessage.textContent = message;
  topUpStatusMessage.dataset.tone = tone;
  if (topUpStatusMeta) topUpStatusMeta.hidden = false;
  if (topUpStatusPaymentId) topUpStatusPaymentId.textContent = topUp.paymentId || "-";
  if (topUpStatusAmount) topUpStatusAmount.textContent = topUp.amountUsdc ? `${topUp.amountUsdc} USDC` : "-";
  if (topUpStatusWallet) topUpStatusWallet.textContent = truncateMiddle(topUp.billingWallet || connectedWallet || "-");
  if (topUpStatusTxHash) topUpStatusTxHash.textContent = truncateMiddle(detectedTxHash || "-");
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
    if (options.persist !== false) writeTopUpState({ projectId: inputs.projectId, paymentId: payload.paymentId });
    if (payload.status !== "waiting_for_payment") lastDetectedTransfer = null;
    renderCurrentTopUp(payload);
    if (payload.status !== "waiting_for_payment") clearTopUpPolling();
    return payload;
  } catch (error) {
    renderCurrentTopUp(null);
    if (!options.silent) setTopUpHistoryStatus(error instanceof Error ? error.message : "Could not load payment status.", "error");
    clearTopUpPolling();
    return null;
  }
}

async function reconcileTopUpTransfer(inputs, paymentId, txHash, options = {}) {
  try {
    const response = await apiFetch(`/v1/credits/topups/${encodeURIComponent(paymentId)}/reconcile`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inputs.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ txHash }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `API returned HTTP ${response.status}`);
    lastDetectedTransfer = payload.reconcile || null;
    renderCurrentTopUp(payload.topUp || null);
    if (payload.topUp?.status === "credited") {
      await refreshBalance(inputs, { silent: true });
      await loadTopUpHistory(inputs, { silent: true });
    }
    return payload;
  } catch (error) {
    if (!options.silent) setCreditStatus(error instanceof Error ? error.message : "Could not reconcile wallet transfer.", "error");
    return null;
  }
}

async function findLatestMatchingTransfer(fromAddress, toAddress, amountUsdc) {
  const latestBlock = Number(hexToBigInt(await baseRpc("eth_blockNumber", [])));
  const fromBlock = `0x${Math.max(latestBlock - 50000, 0).toString(16)}`;
  const logs = await baseRpc("eth_getLogs", [{
    address: BASE_USDC_ADDRESS,
    fromBlock,
    toBlock: "latest",
    topics: [ERC20_TRANSFER_TOPIC, addressTopic(fromAddress), addressTopic(toAddress)],
  }]);
  const recent = (Array.isArray(logs) ? logs : []).slice(-10).reverse().map(log => ({
    txHash: String(log.transactionHash || "").toLowerCase(),
    amountUsdc: formatUsdcUnits(hexToBigInt(log.data || "0x0")),
    blockNumber: Number(hexToBigInt(log.blockNumber || "0x0")),
  }));
  return recent.find(item => item.amountUsdc === String(amountUsdc || "")) || null;
}

function startTopUpPolling(inputs, paymentId) {
  clearTopUpPolling();
  if (!paymentId) return;
  activeTopUpPoll = window.setInterval(async () => {
    let topUp = await loadTopUpStatus(inputs, paymentId, { silent: true });
    if (!topUp) {
      clearTopUpPolling();
      return;
    }
    if (topUp.status === "waiting_for_payment" && connectedWallet && topUp.receivingAddress) {
      try {
        const transfer = await findLatestMatchingTransfer(connectedWallet, topUp.receivingAddress, topUp.amountUsdc);
        if (transfer?.txHash) {
          await reconcileTopUpTransfer(inputs, paymentId, transfer.txHash, { silent: true });
          topUp = await loadTopUpStatus(inputs, paymentId, { silent: true, persist: false });
        }
      } catch {
        // Transfer scanning is best-effort; the scheduled watcher still credits confirmed payments.
      }
    }
    if (!topUp || topUp.status !== "waiting_for_payment") {
      clearTopUpPolling();
      await refreshBalance(inputs, { silent: true });
      await loadTopUpHistory(inputs, { silent: true });
    }
  }, TOPUP_POLL_INTERVAL_MS);
}

async function connectWallet() {
  const provider = selectedProvider();
  if (!provider) {
    setWalletStatus("No compatible EVM wallet is available.", "error");
    return null;
  }
  setWalletStatus("Connecting wallet on Base...");
  try {
    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const address = String(accounts?.[0] || "").toLowerCase();
    if (!address) throw new Error("Wallet did not return an address.");
    await ensureBaseNetwork(provider);
    connectedWallet = address;
    if (billingWalletInput) billingWalletInput.value = connectedWallet;
    const stored = readStoredCredentials();
    if (stored?.billingWallet && sameAddress(stored.billingWallet, connectedWallet)) hydrateCredentials(stored);
    setWalletStatus(`Connected ${truncateMiddle(address, 10, 8)} on Base. You can now create the free API key or pay 5 USDC for 10,000 credits.`, "success");
    return provider;
  } catch (error) {
    setWalletStatus(error instanceof Error ? error.message : "Could not connect wallet.", "error");
    return null;
  }
}

async function ensureConnectedWallet() {
  if (connectedWallet) return selectedProvider();
  return connectWallet();
}

async function refreshBalance(inputs, options = {}) {
  if (!options.silent) setCreditStatus("Refreshing API request balance...");
  const response = await apiFetch(`/v1/projects/${encodeURIComponent(inputs.projectId)}/credits`, {
    headers: { Authorization: `Bearer ${inputs.apiKey}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `API returned HTTP ${response.status}`);
  creditBalance.textContent = `${Number(payload.totalAvailable || 0)} requests`;
  if (Number(payload.freeRemaining || 0) > 0) {
    setCreditStatus(`You still have ${Number(payload.freeRemaining || 0)} free requests. When they run out, click Pay 5 USDC for 10,000 credits.`, "success");
  } else {
    setCreditStatus(`Your free 1,000 requests are used up. Click Pay 5 USDC for ${STARTER_TOPUP_CREDITS.toLocaleString()} paid requests.`, "success");
  }
  return payload;
}

async function refreshDashboard(options = {}) {
  const inputs = requireApiAuthInputs();
  if (!inputs) return;
  try {
    await refreshBalance(inputs, options);
    await loadTopUpHistory(inputs, { silent: options.silent });
    const storedTopUp = readTopUpState();
    if (storedTopUp?.projectId === inputs.projectId && storedTopUp?.paymentId) {
      const topUp = await loadTopUpStatus(inputs, storedTopUp.paymentId, { silent: options.silent });
      if (topUp?.status === "waiting_for_payment") startTopUpPolling(inputs, storedTopUp.paymentId);
    } else if (!options.silent) {
      renderCurrentTopUp(null);
    }
  } catch (error) {
    creditBalance.textContent = "Unavailable";
    setCreditStatus(error instanceof Error ? error.message : "Could not load API dashboard.", "error");
  }
}

async function createFreeProject() {
  const provider = await ensureConnectedWallet();
  if (!provider || !connectedWallet) return;
  setCreditStatus("Creating your free API key...");
  try {
    const response = await apiFetch("/v1/projects/free", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billingWallet: connectedWallet }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `API returned HTTP ${response.status}`);
    hydrateCredentials(payload);
    persistCredentials({ projectId: payload.projectId, apiKey: payload.apiKey, billingWallet: connectedWallet });
    setCreditStatus(`Free API key created. This wallet now has ${Number(payload.freeAllowance || 1000)} free requests.`, "success");
    await refreshDashboard({ silent: true });
  } catch (error) {
    setCreditStatus(
      error instanceof Error && error.message.includes("already has a free API key")
        ? "This wallet already used its free API key. Paste the existing project ID and API key below, or use the browser that created it."
        : error instanceof Error ? error.message : "Could not create the free API key.",
      "error"
    );
  }
}

async function sendUsdcTransfer(provider, fromAddress, toAddress, amountUsdc) {
  await ensureBaseNetwork(provider);
  const amountUnits = parseUsdcUnits(amountUsdc);
  return provider.request({
    method: "eth_sendTransaction",
    params: [{
      from: fromAddress,
      to: BASE_USDC_ADDRESS,
      value: "0x0",
      data: encodeErc20Transfer(toAddress, amountUnits),
    }],
  });
}

async function createStarterTopUp() {
  const inputs = requireApiAuthInputs();
  if (!inputs) return;
  const provider = await ensureConnectedWallet();
  if (!provider || !connectedWallet) return;
  const billingWallet = billingWalletInput?.value.trim() || connectedWallet;
  if (!sameAddress(billingWallet, connectedWallet)) {
    setCreditStatus("The connected wallet must match the billing wallet for the one-click 5 USDC payment.", "error");
    return;
  }
  setCreditStatus(`Creating the ${STARTER_TOPUP_AMOUNT} USDC top-up and opening your wallet...`);
  if (topUpInstructions) topUpInstructions.hidden = true;
  try {
    const response = await apiFetch("/v1/credits/topups", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${inputs.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amountUsdc: STARTER_TOPUP_AMOUNT, billingWallet }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `API returned HTTP ${response.status}`);
    if (topUpInstructions) {
      topUpInstructions.hidden = false;
      topUpInstructions.textContent = [
        `Package: ${STARTER_TOPUP_AMOUNT} USDC on Base -> +${payload.creditAmount} paid requests`,
        `From connected wallet: ${payload.billingWallet}`,
        `To treasury: ${payload.receivingAddress}`,
        `Payment ID: ${payload.paymentId}`,
        "This page checks the latest 10 wallet-to-treasury transfers every 15 seconds.",
      ].join("\n");
    }
    writeTopUpState({ projectId: inputs.projectId, paymentId: payload.paymentId });
    renderCurrentTopUp(payload);
    await loadTopUpHistory(inputs, { silent: true });

    try {
      const txHash = await sendUsdcTransfer(provider, connectedWallet, payload.receivingAddress, payload.amountUsdc);
      lastDetectedTransfer = { accepted: false, reasons: ["wallet_submitted"], txHash, confirmations: 0 };
      renderCurrentTopUp(payload);
      setCreditStatus("Wallet approval sent. Waiting for the Base USDC transfer and confirmations.", "success");
      await reconcileTopUpTransfer(inputs, payload.paymentId, txHash, { silent: true });
    } catch (walletError) {
      setCreditStatus(walletError instanceof Error ? walletError.message : "Wallet payment was not sent.", "error");
    }

    startTopUpPolling(inputs, payload.paymentId);
  } catch (error) {
    setCreditStatus(error instanceof Error ? error.message : "Could not create the 5 USDC top-up.", "error");
  }
}

connectWalletButton?.addEventListener("click", connectWallet);
createFreeProjectButton?.addEventListener("click", createFreeProject);
checkCreditsButton?.addEventListener("click", () => refreshDashboard());
createTopUpButton?.addEventListener("click", createStarterTopUp);
walletProviderSelect?.addEventListener("change", () => {
  setWalletStatus("Wallet provider changed. Connect the selected wallet on Base.", "neutral");
});
projectIdInput?.addEventListener("change", () => persistCredentials({ ...readStoredCredentials(), ...apiAuthInputs(), billingWallet: billingWalletInput?.value.trim() || connectedWallet }));
apiKeyInput?.addEventListener("change", () => persistCredentials({ ...readStoredCredentials(), ...apiAuthInputs(), billingWallet: billingWalletInput?.value.trim() || connectedWallet }));
window.addEventListener("txreceipts:walletsChanged", syncWalletOptions);

syncWalletOptions();
hydrateCredentials(readStoredCredentials());
setWalletStatus("Choose an EVM wallet and connect it on Base.", "neutral");
renderCurrentTopUp(null);
if (apiAuthInputs().projectId && apiAuthInputs().apiKey) {
  refreshDashboard({ silent: true });
}