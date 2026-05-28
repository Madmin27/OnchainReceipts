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

let connectedWallet = "";

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