let receipt = null;

const artifact = document.querySelector("#receiptArtifact");
const emptyReceipt = document.querySelector("#emptyReceipt");
const txForm = document.querySelector("#txForm");
const txInput = document.querySelector("#txHash");
const txStatus = document.querySelector("#txStatus");
const connectWalletButton = document.querySelector("#connectWallet");
const walletLabel = document.querySelector("#walletLabel");
const networkSelect = document.querySelector("#networkSelect");
const loadHistoryButton = document.querySelector("#loadHistory");
const loadMoreHistoryButton = document.querySelector("#loadMoreHistory");
const historyStatus = document.querySelector("#historyStatus");
const historyList = document.querySelector("#historyList");
const historyTabs = document.querySelectorAll("[data-history-tab]");

const BASE_RPC_URL = "https://mainnet.base.org";
const BASE_BLOCKSCOUT_URL = "https://base.blockscout.com";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ETH_DECIMALS = 18n;
const PAGE_SIZE = 20;

const knownTokens = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6n },
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18n },
  "0x4200000000000000000000000000000000000042": { symbol: "OP", decimals: 18n },
  "0x532f27101965dd16442e59d40670faf5ebb142e4": { symbol: "BRETT", decimals: 18n },
};

let connectedWallet = null;
let activeHistoryTab = "all";
let historyState = {
  transactions: [],
  transfers: [],
  txNext: null,
  transferNext: null,
};

function escapeText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rowsToSvg(rows) {
  return rows
    .slice(0, 4)
    .map((row, index) => {
      const y = 344 + index * 38;
      return `<text x="56" y="${y}" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">${escapeXml(row.label)}</text>
  <text x="184" y="${y}" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700">${escapeXml(row.value)}</text>
  <text x="340" y="${y}" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">${escapeXml(row.detail)}</text>`;
    })
    .join("\n  ");
}

function buildReceiptSvg(data) {
  const safe = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, escapeXml(value)]));
  const rows = Array.isArray(data.transferRows) ? data.transferRows : [];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="620" viewBox="0 0 860 620">
  <rect width="860" height="620" fill="#ffffff"/>
  <rect x="28" y="28" width="804" height="564" rx="8" fill="#ffffff" stroke="#d7ddd4"/>
  <text x="56" y="72" fill="#0052ff" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="1.2">ONCHAINRECEIPTS</text>
  <text x="56" y="112" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="760">${safe.title}</text>
  <rect x="694" y="54" width="98" height="34" rx="17" fill="#e5f4ec"/>
  <text x="718" y="76" fill="#0b7a45" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="760">${safe.status}</text>

  <line x1="56" y1="148" x2="804" y2="148" stroke="#d7ddd4"/>
  <text x="56" y="188" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="13">Sent</text>
  <text x="56" y="222" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="760">${safe.sent}</text>
  <line x1="306" y1="204" x2="394" y2="204" stroke="#d7ddd4" stroke-width="2"/>
  <text x="438" y="188" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="13">Received</text>
  <text x="438" y="222" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="760">${safe.received}</text>
  <rect x="684" y="156" width="92" height="92" rx="6" fill="#f4f7f4" stroke="#d7ddd4"/>
  <text x="703" y="192" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700">BaseScan</text>
  <text x="699" y="216" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="11">tx details</text>
  <text x="682" y="262" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="10">${safe.tx}</text>
  <line x1="56" y1="286" x2="804" y2="286" stroke="#d7ddd4"/>

  <text x="56" y="326" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="760">Payment and fee breakdown</text>
  ${rowsToSvg(rows)}

  <line x1="56" y1="508" x2="804" y2="508" stroke="#d7ddd4"/>
  <text x="56" y="536" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">App</text>
  <text x="56" y="560" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700">${safe.app}</text>
  <text x="212" y="536" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">Network</text>
  <text x="212" y="560" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700">${safe.network}</text>
  <text x="356" y="536" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">Wallet</text>
  <text x="356" y="560" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700">${safe.from}</text>
  <text x="518" y="536" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">Block</text>
  <text x="518" y="560" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700">${safe.block || "Pending"}</text>

  <text x="56" y="586" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">Receipt ${safe.id} - ${safe.date} - ${safe.tx}</text>
  <text x="650" y="586" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700">Verified on Base</text>
</svg>`;
}

function renderArtifact() {
  if (!receipt) {
    artifact.hidden = true;
    emptyReceipt.hidden = false;
    return;
  }
  artifact.innerHTML = buildReceiptSvg(receipt);
  artifact.hidden = false;
  emptyReceipt.hidden = true;
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
  const response = await fetch(BASE_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });

  if (!response.ok) {
    throw new Error(`Base RPC returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message || "Base RPC error");
  }

  return payload.result;
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
  return entity.ens_domain_name || entity.name || shortHash(entity.hash || entity);
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
  const url = new URL(path, BASE_BLOCKSCOUT_URL);
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
    hash: item.hash,
    title: `${isIncoming ? "Incoming" : isOutgoing ? "Outgoing" : "Contract"} ${method}`,
    subtitle: `${labelAddress(item.from)} -> ${labelAddress(item.to)}`,
    timestamp: item.timestamp,
    value: item.value && item.value !== "0" ? formatEthValue(item.value) : item.status || item.result || "ok",
    direction: isIncoming ? "incoming" : isOutgoing ? "outgoing" : "other",
  };
}

function normalizeTransfer(item) {
  const from = item.from?.hash || "";
  const to = item.to?.hash || "";
  const tokenType = item.token_type || item.token?.type || "token";
  const isNft = tokenType === "ERC-721" || tokenType === "ERC-1155";
  const decimals = item.total?.decimals ?? item.token?.decimals ?? (isNft ? 0 : 18);
  const symbol = item.token?.symbol || item.token?.name || tokenType;
  const amount = isNft
    ? `#${item.total?.token_id || "token"}`
    : `${formatDecimalUnits(item.total?.value || "0", decimals)} ${symbol}`;
  const isIncoming = sameAddress(to, connectedWallet) && !sameAddress(from, connectedWallet);
  const isOutgoing = sameAddress(from, connectedWallet);

  return {
    kind: isNft ? "nft" : "token",
    hash: item.transaction_hash,
    title: `${isIncoming ? "Incoming" : isOutgoing ? "Outgoing" : "Observed"} ${tokenType}`,
    subtitle: `${labelAddress(item.from)} -> ${labelAddress(item.to)}`,
    timestamp: item.timestamp,
    value: amount,
    direction: isIncoming ? "incoming" : isOutgoing ? "outgoing" : "other",
  };
}

function combinedHistoryItems() {
  const normalized = [
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
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    .slice(0, PAGE_SIZE);
}

function renderHistory() {
  const items = combinedHistoryItems();
  historyList.innerHTML = "";

  if (!connectedWallet) {
    setHistoryStatus("Connect a wallet to load the latest Base activity automatically.");
    loadMoreHistoryButton.hidden = true;
    return;
  }

  if (!items.length) {
    setHistoryStatus("No activity found for this tab yet.");
    loadMoreHistoryButton.hidden = !historyState.txNext && !historyState.transferNext;
    return;
  }

  setHistoryStatus(`Showing ${items.length} recent ${activeHistoryTab === "all" ? "transaction" : activeHistoryTab} record${items.length === 1 ? "" : "s"}.`);

  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    button.innerHTML = `<span><strong>${escapeText(item.title)}</strong><span class="history-meta">${escapeText(item.subtitle)} · ${escapeText(formatDate(item.timestamp))}</span></span><span class="history-value">${escapeText(item.value)}</span><span class="history-receipt-button">Receipt</span>`;
    button.addEventListener("click", async () => {
      await generateAndDownloadReceipt(item.hash);
    });
    historyList.appendChild(button);
  }

  loadMoreHistoryButton.hidden = !historyState.txNext && !historyState.transferNext;
}

async function loadHistory({ more = false } = {}) {
  if (!connectedWallet) {
    setHistoryStatus("Connect a wallet first.", "error");
    return;
  }

  try {
    setHistoryStatus(more ? "Loading older Base activity..." : "Loading latest Base activity...");
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
    renderHistory();
  } catch (error) {
    setHistoryStatus(error instanceof Error ? error.message : "Could not load wallet history.", "error");
  }
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

function inferTitle(summary, tx) {
  if (summary.firstSent && summary.firstReceived) {
    return `${summary.firstSent.symbol} to ${summary.firstReceived.symbol} activity`;
  }

  if (summary.firstSent) return `${summary.firstSent.symbol} transfer`;
  if (hexToBigInt(tx.value) > 0n) return "ETH transfer";
  return "Base transaction";
}

function buildReceiptFromChain(txHash, tx, txReceipt) {
  const transfers = parseTransfers(txReceipt.logs || []);
  const summary = summarizeTransfers(tx, transfers);
  const gasFeeWei = hexToBigInt(txReceipt.gasUsed) * hexToBigInt(txReceipt.effectiveGasPrice || tx.gasPrice);
  const ethValue = hexToBigInt(tx.value);
  const success = txReceipt.status === "0x1";

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

  return {
    id: `or_base_${txHash.slice(2, 10)}`,
    title: inferTitle(summary, tx),
    app: tx.to ? shortHash(tx.to) : "Contract creation",
    network: "Base",
    date: new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    tx: shortHash(txHash),
    from: shortHash(tx.from),
    sent: sentText,
    received: receivedText,
    gas: `${formatUnits(gasFeeWei, ETH_DECIMALS, 8)} ETH`,
    appFee: summary.sent.length > 1 ? "Detected in transfers" : "Not detected",
    protocolFee: "Not detected",
    status: success ? "Verified" : "Failed",
    explorerUrl: `https://basescan.org/tx/${txHash}`,
    block: String(parseInt(txReceipt.blockNumber, 16)),
    transferRows: [
      {
        label: "User paid",
        value: sentText,
        detail: summary.firstSent ? transferDetail(summary.firstSent, tx.from.toLowerCase()) : "Native value or contract call",
      },
      {
        label: "User received",
        value: receivedText,
        detail: summary.firstReceived ? transferDetail(summary.firstReceived, tx.from.toLowerCase()) : "No direct wallet receipt",
      },
      {
        label: "Gas paid",
        value: `${formatUnits(gasFeeWei, ETH_DECIMALS, 8)} ETH`,
        detail: "Base network fee",
      },
      {
        label: "Other transfers",
        value: `${Math.max(transfers.length - 2, 0)} observed`,
        detail: "Potential router, fee, or protocol movement",
      },
    ],
  };
}

function setWallet(address, chainId) {
  connectedWallet = address || null;
  walletLabel.textContent = address ? `${shortHash(address)} · chain ${parseInt(chainId || "0x0", 16)}` : "Not connected";
  connectWalletButton.textContent = address ? "Wallet connected" : "Connect wallet";
  if (connectedWallet) {
    loadHistory();
  } else {
    historyState = { transactions: [], transfers: [], txNext: null, transferNext: null };
    renderHistory();
  }
}

async function ensureBaseNetwork() {
  if (!window.ethereum) throw new Error("No injected wallet found.");
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId === "0x2105") {
    return chainId;
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x2105" }],
    });
  } catch (error) {
    if (error && error.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x2105",
            chainName: "Base",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [BASE_RPC_URL],
            blockExplorerUrls: ["https://basescan.org"],
          },
        ],
      });
    } else {
      throw error;
    }
  }

  return window.ethereum.request({ method: "eth_chainId" });
}

connectWalletButton.addEventListener("click", async () => {
  try {
    if (connectedWallet) {
      setWallet(null, "0x0");
      setStatus("Wallet disconnected locally.", "success");
      return;
    }

    if (!window.ethereum) {
      setStatus("No injected wallet found. Install MetaMask or a compatible wallet.", "error");
      return;
    }

    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const chainId = await ensureBaseNetwork();
    setWallet(accounts[0], chainId);
    networkSelect.value = "8453";
    setStatus("Wallet connected and Base network selected.", "success");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not connect wallet.", "error");
  }
});

loadHistoryButton.addEventListener("click", () => loadHistory());
loadMoreHistoryButton.addEventListener("click", () => loadHistory({ more: true }));

historyTabs.forEach(tabButton => {
  tabButton.addEventListener("click", () => {
    activeHistoryTab = tabButton.dataset.historyTab;
    historyTabs.forEach(button => button.classList.toggle("active", button === tabButton));
    renderHistory();
  });
});

if (window.ethereum) {
  window.ethereum.request({ method: "eth_accounts" }).then(async accounts => {
    if (accounts && accounts[0]) {
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      setWallet(accounts[0], chainId);
    }
  });

  window.ethereum.on?.("accountsChanged", accounts => {
    setWallet(accounts && accounts[0] ? accounts[0] : null, "0x0");
  });

  window.ethereum.on?.("chainChanged", chainId => {
    const current = walletLabel.textContent.split(" · ")[0];
    walletLabel.textContent = `${current} · chain ${parseInt(chainId, 16)}`;
  });
}

txForm.addEventListener("submit", async event => {
  event.preventDefault();
  const txHash = txInput.value.trim();
  await generateReceipt(txHash, { download: false });
});

async function generateReceipt(txHash, { download = false } = {}) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    setStatus("Enter a valid 0x transaction hash.", "error");
    return;
  }

  try {
    setStatus("Fetching transaction from Base RPC...");
    const [tx, txReceipt] = await Promise.all([
      rpc("eth_getTransactionByHash", [txHash]),
      rpc("eth_getTransactionReceipt", [txHash]),
    ]);

    if (!tx || !txReceipt) {
      setStatus("Transaction not found on Base yet.", "error");
      return;
    }

    receipt = buildReceiptFromChain(txHash, tx, txReceipt);
    renderArtifact();
    setStatus("Receipt generated from Base transaction data.", "success");
    if (download) {
      await downloadReceiptPng();
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not fetch Base transaction.", "error");
  }
}

async function generateAndDownloadReceipt(txHash) {
  txInput.value = txHash;
  await generateReceipt(txHash, { download: true });
}

function downloadReceiptPng() {
  if (!receipt) return Promise.resolve();
  return new Promise(resolve => {
    const image = new Image();
    const svg = buildReceiptSvg(receipt);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1720;
      canvas.height = 1240;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) {
          setStatus("Could not create receipt PNG.", "error");
          resolve();
          return;
        }
        const pngUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = pngUrl;
        link.download = `${receipt.id || "onchain-receipt"}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(pngUrl);
        setStatus("Receipt PNG downloaded.", "success");
        resolve();
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setStatus("Could not render receipt PNG.", "error");
      resolve();
    };
    image.src = url;
  });
}

renderArtifact();
