let receipt = null;

const txForm = document.querySelector("#txForm");
const txInput = document.querySelector("#txHash");
const txStatus = document.querySelector("#txStatus");
const connectWalletButton = document.querySelector("#connectWallet");
const walletLabel = document.querySelector("#walletLabel");
const networkSelect = document.querySelector("#networkSelect");
const walletProviderSelect = document.querySelector("#walletProviderSelect");
const loadMoreHistoryButton = document.querySelector("#loadMoreHistory");
const historyStatus = document.querySelector("#historyStatus");
const historyList = document.querySelector("#historyList");
const historyTabs = document.querySelectorAll("[data-history-tab]");

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ETH_DECIMALS = 18n;
const PAGE_SIZE = 20;
const SOLANA_HISTORY_PAGE_ATTEMPTS = 5;
const MAX_QR_BYTES = 80_000;
const RECEIPT_WIDTH = 1720;
const RECEIPT_HEIGHT = 1680;
const networks = window.TX_RECEIPTS_NETWORKS || [];

const knownTokens = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6n },
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18n },
  "0x4200000000000000000000000000000000000042": { symbol: "OP", decimals: 18n },
  "0x532f27101965dd16442e59d40670faf5ebb142e4": { symbol: "BRETT", decimals: 18n },
};

let connectedWallet = null;
let walletProvider = null;
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

function currentNetwork() {
  return networks.find(network => network.id === networkSelect.value) || networks[0];
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
  return window.TxReceiptsWallets?.getInfo(walletProviderSelect.value) || null;
}

function walletOptions() {
  return window.TxReceiptsWallets?.list() || [];
}

function setStatus(message, tone = "neutral") {
  txStatus.textContent = message;
  txStatus.dataset.tone = tone;
}

function setHistoryStatus(message, tone = "neutral") {
  historyStatus.textContent = message;
  historyStatus.dataset.tone = tone;
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
  const from = item.from?.hash || "";
  const to = item.to?.hash || "";
  const isIncoming = sameAddress(to, connectedWallet) && !sameAddress(from, connectedWallet);
  const isOutgoing = sameAddress(from, connectedWallet);
  const method = item.method || item.decoded_input?.method_call?.split("(")[0] || "transaction";
  return {
    kind: "tx",
    hash: safeDisplay(item.hash, 66),
    title: `${isIncoming ? "Incoming" : isOutgoing ? "Outgoing" : "Contract"} ${safeDisplay(method, 40)}`,
    subtitle: `${labelAddress(item.from)} -> ${labelAddress(item.to)}`,
    timestamp: item.timestamp,
    value: item.value && item.value !== "0" ? formatEthValue(item.value) : safeDisplay(item.status || item.result || "ok", 48),
    direction: isIncoming ? "incoming" : isOutgoing ? "outgoing" : "other",
  };
}

function normalizeTransfer(item) {
  const from = item.from?.hash || "";
  const to = item.to?.hash || "";
  const tokenType = item.token_type || item.token?.type || "token";
  const isNft = tokenType === "ERC-721" || tokenType === "ERC-1155";
  const decimals = item.total?.decimals ?? item.token?.decimals ?? (isNft ? 0 : 18);
  const symbol = safeDisplay(item.token?.symbol || item.token?.name || tokenType, 24);
  const amount = isNft
    ? `#${item.total?.token_id || "token"}`
    : `${formatDecimalUnits(item.total?.value || "0", decimals)} ${symbol}`;
  const isIncoming = sameAddress(to, connectedWallet) && !sameAddress(from, connectedWallet);
  const isOutgoing = sameAddress(from, connectedWallet);

  return {
    kind: isNft ? "nft" : "token",
    hash: safeDisplay(item.transaction_hash, 66),
    title: `${isIncoming ? "Incoming" : isOutgoing ? "Outgoing" : "Observed"} ${tokenType}`,
    subtitle: `${labelAddress(item.from)} -> ${labelAddress(item.to)}`,
    timestamp: item.timestamp,
    value: amount,
    direction: isIncoming ? "incoming" : isOutgoing ? "outgoing" : "other",
  };
}

function allHistoryItems() {
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
    .filter(item => {
      if (activeHistoryTab === "all") return item.kind === "tx";
      if (activeHistoryTab === "tokens") return item.kind === "token";
      if (activeHistoryTab === "nfts") return item.kind === "nft";
      return item.direction === activeHistoryTab;
    })
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
}

function normalizeSolanaTx(item) {
  const failed = Boolean(item.err);
  return {
    kind: "tx",
    hash: safeDisplay(item.signature, 96),
    title: failed ? "Solana transaction failed" : "Solana transaction",
    subtitle: `${shortHash(connectedWallet)} - slot ${item.slot || "unknown"}`,
    timestamp: item.blockTime ? new Date(item.blockTime * 1000).toISOString() : null,
    value: failed ? "failed" : "ok",
    direction: "other",
  };
}

function combinedHistoryItems() {
  return allHistoryItems().slice(0, visibleHistoryLimit);
}

function renderHistory() {
  const items = combinedHistoryItems();
  const allItems = allHistoryItems();
  historyList.textContent = "";

  if (!connectedWallet) {
    setHistoryStatus(`Connect a wallet to load the latest ${currentNetwork().name} activity automatically.`);
    loadMoreHistoryButton.hidden = true;
    return;
  }

  if (!items.length) {
    setHistoryStatus("No activity found for this tab yet.");
    loadMoreHistoryButton.hidden = !historyState.txNext && !historyState.transferNext;
    return;
  }

  setHistoryStatus(`Showing ${items.length} of ${allItems.length} ${activeHistoryTab === "all" ? "transaction" : activeHistoryTab} record${items.length === 1 ? "" : "s"}.`);

  for (const item of items) {
    const row = document.createElement("div");
    const text = document.createElement("span");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const value = document.createElement("span");
    const receiptAction = document.createElement("button");
    row.className = "history-item";
    title.textContent = safeDisplay(item.title);
    meta.className = "history-meta";
    meta.textContent = `${safeDisplay(item.subtitle, 100)} - ${formatDate(item.timestamp)}`;
    value.className = "history-value";
    value.textContent = safeDisplay(item.value, 48);
    receiptAction.className = "history-receipt-button";
    receiptAction.type = "button";
    receiptAction.textContent = "Receipt";
    text.append(title, meta);
    row.append(text, value, receiptAction);
    row.addEventListener("click", () => {
      txInput.value = item.hash;
      setStatus("Transaction hash selected. Use Fetch receipt or the Receipt button to download.", "neutral");
    });
    receiptAction.addEventListener("click", async event => {
      event.stopPropagation();
      await generateAndDownloadReceipt(item.hash);
    });
    historyList.appendChild(row);
  }

  loadMoreHistoryButton.hidden = visibleHistoryLimit >= allItems.length && !historyState.txNext && !historyState.transferNext;
}

async function loadHistory({ more = false } = {}) {
  if (!connectedWallet) {
    setHistoryStatus("Connect a wallet first.", "error");
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
      fetchJson(buildUrl(`/api/v2/addresses/${connectedWallet}/transactions`, txParams)),
      fetchJson(buildUrl(`/api/v2/addresses/${connectedWallet}/token-transfers`, transferParams)),
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
  if (!more) {
    visibleHistoryLimit = PAGE_SIZE;
  }
  setHistoryStatus(more ? "Loading older Solana activity..." : "Loading latest Solana activity...");
  let before = more ? historyState.txNext : undefined;
  const signatures = [];
  let hasMore = false;
  for (let attempt = 0; attempt < SOLANA_HISTORY_PAGE_ATTEMPTS && signatures.length < PAGE_SIZE; attempt += 1) {
    const limit = PAGE_SIZE - signatures.length;
    const params = [connectedWallet, { limit, ...(before ? { before } : {}) }];
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

function transferDetail(item, sender) {
  if (!item) return "";
  const direction = item.from === sender ? `${shortHash(item.from)} -> ${shortHash(item.to)}` : `${shortHash(item.from)} -> ${shortHash(item.to)}`;
  return direction;
}

function inferMethod(tx) {
  if (!tx.input || tx.input === "0x") return "native transfer";
  return `${tx.input.slice(0, 10)} call`;
}

function topObservedTransferRows(transfers, sender, existingRows) {
  const used = new Set(existingRows.map(row => `${row.value}:${row.detail}`));
  return transfers
    .map(item => ({
      label: item.from === sender ? "Token out" : item.to === sender ? "Token in" : "Token movement",
      value: transferText(item, "Token transfer"),
      detail: transferDetail(item, sender),
    }))
    .filter(row => {
      const key = `${row.value}:${row.detail}`;
      if (used.has(key)) return false;
      used.add(key);
      return true;
    })
    .slice(0, 2);
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

function buildReceiptFromChain(txHash, tx, txReceipt, block) {
  const network = currentNetwork();
  const transfers = parseTransfers(txReceipt.logs || []);
  const summary = summarizeTransfers(tx, transfers);
  const gasFeeWei = hexToBigInt(txReceipt.gasUsed) * hexToBigInt(txReceipt.effectiveGasPrice || tx.gasPrice);
  const ethValue = hexToBigInt(tx.value);
  const success = txReceipt.status === "0x1";
  const sender = tx.from.toLowerCase();
  const explorerUrl = `${network.explorerUrl}/tx/${txHash}`;

  const sentText = summary.firstSent
    ? transferText(summary.firstSent, "Observed token transfer")
    : ethValue > 0n
      ? `${formatUnits(ethValue, ETH_DECIMALS)} ETH`
      : "No direct asset sent";

  const receivedText = summary.firstReceived
    ? transferText(summary.firstReceived, "Observed token transfer")
    : transfers.length
      ? `${transfers.length} token transfer${transfers.length === 1 ? "" : "s"}`
      : "No token receipt detected";

  const baseRows = [
    {
      label: "User paid",
      value: sentText,
      detail: summary.firstSent ? transferDetail(summary.firstSent, sender) : "Native value or contract call",
    },
    {
      label: "User received",
      value: receivedText,
      detail: summary.firstReceived ? transferDetail(summary.firstReceived, sender) : "No direct wallet receipt",
    },
    {
      label: "Gas paid",
      value: `${formatUnits(gasFeeWei, ETH_DECIMALS, 8)} ETH`,
      detail: `${network.name} network fee`,
    },
  ];

  return {
    id: `or_${network.id}_${txHash.slice(2, 10)}`,
    title: inferTitle(summary, tx),
    app: tx.to ? shortHash(tx.to) : "Contract creation",
    network: network.name,
    date: block?.timestamp
      ? new Date(Number(hexToBigInt(block.timestamp)) * 1000).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
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
    block: String(parseInt(txReceipt.blockNumber, 16)),
    method: inferMethod(tx),
    transferRows: [
      ...baseRows,
      ...topObservedTransferRows(transfers, sender, baseRows),
      ...(transfers.length > 2
        ? [{
            label: "Other transfers",
            value: `${Math.max(transfers.length - 2, 0)} observed`,
            detail: "Potential router, fee, or protocol movement",
          }]
        : []),
    ],
  };
}

function lamportsToSol(lamports) {
  return `${formatUnits(BigInt(Math.max(Number(lamports || 0), 0)), 9n, 9)} SOL`;
}

function buildSolanaReceipt(signature, tx) {
  const network = currentNetwork();
  const meta = tx?.meta || {};
  const message = tx?.transaction?.message || {};
  const accountKeys = message.accountKeys || [];
  const signer = accountKeys[0]?.pubkey || accountKeys[0] || connectedWallet;
  const fee = meta.fee || 0;
  const failed = Boolean(meta.err);
  const blockTime = tx?.blockTime ? new Date(tx.blockTime * 1000) : new Date();
  const explorerUrl = `${network.explorerUrl}/tx/${signature}`;
  return {
    id: `or_${network.id}_${signature.slice(0, 8)}`,
    title: "Solana transaction",
    app: safeDisplay(signer, 44),
    network: network.name,
    date: blockTime.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
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
  connectWalletButton.textContent = address ? "Wallet connected" : "Connect wallet";
  if (connectedWallet) {
    loadHistory();
  } else {
    walletProvider = null;
    resetHistory();
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
    option.textContent = `${wallet.name} (${wallet.family})`;
    walletProviderSelect.appendChild(option);
  });
  const previousStillValid = preserveSelection && compatible.some(wallet => wallet.id === previousValue);
  walletProviderSelect.value = previousStillValid ? previousValue : compatible[0].id;
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
      setStatus("No injected wallet found. Install MetaMask or a compatible wallet.", "error");
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
  resetHistory();
  txStatus.textContent = `Selected ${currentNetwork().name}. Paste a tx hash or connect a wallet.`;
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

async function generateReceipt(txHash, { download = false } = {}) {
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
      await generateSolanaReceipt(txHash, { download });
      return;
    }
    setStatus(`Fetching transaction from ${network.name} RPC...`);
    const [tx, txReceipt] = await Promise.all([
      rpc("eth_getTransactionByHash", [txHash]),
      rpc("eth_getTransactionReceipt", [txHash]),
    ]);

    if (!tx || !txReceipt) {
      setStatus("Transaction not found on Base yet.", "error");
      return;
    }

    const block = await rpc("eth_getBlockByNumber", [txReceipt.blockNumber, false]);
    receipt = buildReceiptFromChain(txHash, tx, txReceipt, block);
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

async function generateSolanaReceipt(signature, { download = false } = {}) {
  setStatus("Fetching transaction from Solana RPC...");
  const tx = await solanaRpc("getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
  ]);
  if (!tx) {
    setStatus("Transaction not found on Solana yet.", "error");
    return;
  }
  receipt = buildSolanaReceipt(signature, tx);
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

function drawDivider(context, y) {
  context.strokeStyle = "#d7ddd4";
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
  const rows = Array.isArray(data.transferRows) ? data.transferRows.slice(0, 5) : [];

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  roundedRect(context, 64, 64, 1592, 1552, 18);
  context.fillStyle = "#ffffff";
  context.fill();
  context.strokeStyle = "#d7ddd4";
  context.lineWidth = 2;
  context.stroke();

  drawText(context, "TXRECEIPTS", 112, 150, { color: "#0052ff", size: 24, weight: 800, maxLength: 24 });
  drawText(context, data.title, 112, 228, { size: 64, weight: 800, maxLength: 42 });
  roundedRect(context, 1408, 114, 180, 68, 34);
  context.fillStyle = data.status === "Verified" ? "#e5f4ec" : "#ffe4e4";
  context.fill();
  drawText(context, data.status, 1498, 158, {
    align: "center",
    color: data.status === "Verified" ? "#0b7a45" : "#9f1d1d",
    size: 24,
    weight: 800,
    maxLength: 18,
  });

  drawDivider(context, 300);
  drawText(context, "Sent", 112, 380, { color: "#5c655f", size: 26 });
  drawText(context, data.sent, 112, 440, { size: 52, weight: 800, maxLength: 28 });
  drawText(context, "Received", 880, 380, { color: "#5c655f", size: 26 });
  drawText(context, data.received, 880, 440, { size: 52, weight: 800, maxLength: 28 });
  context.strokeStyle = "#d7ddd4";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(680, 414);
  context.lineTo(800, 414);
  context.stroke();

  roundedRect(context, 1368, 320, 188, 188, 14);
  context.fillStyle = "#f4f7f4";
  context.fill();
  context.strokeStyle = "#d7ddd4";
  context.stroke();
  if (qrImage) {
    context.drawImage(qrImage, 1382, 334, 160, 160);
  } else {
    drawText(context, "Explorer", 1462, 398, { align: "center", size: 26, weight: 800, maxLength: 12 });
    drawText(context, "tx details", 1462, 438, { align: "center", color: "#5c655f", size: 20, maxLength: 12 });
  }
  drawText(context, "Scan for transaction details", 1462, 540, { align: "center", color: "#5c655f", size: 18, maxLength: 36 });

  drawDivider(context, 590);
  drawText(context, "Payment and fee breakdown", 112, 670, { size: 34, weight: 800, maxLength: 40 });
  rows.forEach((row, index) => {
    const y = 735 + index * 64;
    drawText(context, row.label, 112, y, { color: "#5c655f", size: 24, maxLength: 28 });
    drawText(context, row.value, 376, y, { size: 28, weight: 800, maxLength: 30 });
    drawText(context, row.detail, 720, y, { color: "#5c655f", size: 24, maxLength: 70 });
  });

  drawDivider(context, 1084);
  drawText(context, "Transaction details", 112, 1160, { size: 34, weight: 800, maxLength: 28 });
  drawText(context, "Method", 112, 1225, { color: "#5c655f", size: 22 });
  drawText(context, data.method || "contract call", 240, 1225, { size: 24, weight: 800, maxLength: 28 });
  drawText(context, "Status", 560, 1225, { color: "#5c655f", size: 22 });
  drawText(context, data.status, 680, 1225, { size: 24, weight: 800, maxLength: 18 });
  drawText(context, "Block", 890, 1225, { color: "#5c655f", size: 22 });
  drawText(context, data.block || "Pending", 1000, 1225, { size: 24, weight: 800, maxLength: 18 });
  drawText(context, "Time", 1200, 1225, { color: "#5c655f", size: 22 });
  drawText(context, data.date, 1290, 1225, { size: 24, weight: 800, maxLength: 30 });

  drawText(context, "From", 112, 1305, { color: "#5c655f", size: 22 });
  drawText(context, data.fromFull, 112, 1345, { family: "ui-monospace, SFMono-Regular, Consolas, monospace", size: 24, weight: 800, maxLength: 66 });
  drawText(context, "To", 112, 1405, { color: "#5c655f", size: 22 });
  drawText(context, data.toFull, 112, 1445, { family: "ui-monospace, SFMono-Regular, Consolas, monospace", size: 24, weight: 800, maxLength: 66 });
  drawText(context, "Tx hash", 112, 1505, { color: "#5c655f", size: 22 });
  drawText(context, data.fullTxHash, 112, 1545, { family: "ui-monospace, SFMono-Regular, Consolas, monospace", size: 24, weight: 800, maxLength: 66 });
  drawText(context, `Receipt ${data.id} - ${data.network}`, 112, 1592, { color: "#5c655f", size: 20, maxLength: 54 });
  drawText(context, `Verified on ${data.network}`, 1540, 1592, { align: "right", size: 24, weight: 800, maxLength: 28 });

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
setTimeout(() => populateWalletProviders(), 300);
resetHistory();
