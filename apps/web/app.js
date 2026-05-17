let receipt = null;

const txForm = document.querySelector("#txForm");
const txInput = document.querySelector("#txHash");
const txStatus = document.querySelector("#txStatus");
const connectWalletButton = document.querySelector("#connectWallet");
const walletLabel = document.querySelector("#walletLabel");
const networkSelect = document.querySelector("#networkSelect");
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
const MAX_QR_BYTES = 80_000;

const knownTokens = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6n },
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18n },
  "0x4200000000000000000000000000000000000042": { symbol: "OP", decimals: 18n },
  "0x532f27101965dd16442e59d40670faf5ebb142e4": { symbol: "BRETT", decimals: 18n },
};

let connectedWallet = null;
let activeHistoryTab = "all";
let visibleHistoryLimit = PAGE_SIZE;
let historyState = {
  transactions: [],
  transfers: [],
  txNext: null,
  transferNext: null,
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeDisplay(value, maxLength = 120) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function rowsToSvg(rows) {
  return rows
    .slice(0, 4)
    .map((row, index) => {
      const y = 344 + index * 38;
      return `<text x="56" y="${y}" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">${escapeXml(safeDisplay(row.label, 26))}</text>
  <text x="184" y="${y}" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700">${escapeXml(safeDisplay(row.value, 24))}</text>
  <text x="340" y="${y}" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">${escapeXml(safeDisplay(row.detail, 54))}</text>`;
    })
    .join("\n  ");
}

function splitLong(value, first = 38) {
  if (!value || value.length <= first) return [value || "", ""];
  return [value.slice(0, first), value.slice(first)];
}

function buildReceiptSvg(data) {
  const safe = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, escapeXml(safeDisplay(value, 160))]),
  );
  const rows = Array.isArray(data.transferRows) ? data.transferRows : [];
  const [hashA, hashB] = splitLong(data.fullTxHash || data.tx || "");
  const [fromA, fromB] = splitLong(data.fromFull || data.from || "", 28);
  const [toA, toB] = splitLong(data.toFull || data.app || "", 28);
  const qrImage = data.qrDataUrl
    ? `<image x="684" y="156" width="92" height="92" href="${escapeXml(data.qrDataUrl)}"/>`
    : `<rect x="684" y="156" width="92" height="92" rx="6" fill="#f4f7f4" stroke="#d7ddd4"/>
  <text x="703" y="192" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700">BaseScan</text>
  <text x="699" y="216" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="11">tx details</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="760" viewBox="0 0 860 760">
  <rect width="860" height="760" fill="#ffffff"/>
  <rect x="28" y="28" width="804" height="704" rx="8" fill="#ffffff" stroke="#d7ddd4"/>
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
  ${qrImage}
  <text x="682" y="262" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="10">${safe.tx}</text>
  <line x1="56" y1="286" x2="804" y2="286" stroke="#d7ddd4"/>

  <text x="56" y="326" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="760">Payment and fee breakdown</text>
  ${rowsToSvg(rows)}

  <line x1="56" y1="544" x2="804" y2="544" stroke="#d7ddd4"/>
  <text x="56" y="576" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="760">Transaction details</text>
  <text x="56" y="608" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">Method</text>
  <text x="128" y="608" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="700">${safe.method || "contract call"}</text>
  <text x="250" y="608" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">Status</text>
  <text x="316" y="608" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="700">${safe.status}</text>
  <text x="430" y="608" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">Block</text>
  <text x="488" y="608" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="700">${safe.block || "Pending"}</text>
  <text x="610" y="608" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">Time</text>
  <text x="658" y="608" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="700">${safe.date}</text>
  <text x="56" y="640" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">From</text>
  <text x="128" y="640" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700">${escapeXml(fromA)}</text>
  <text x="128" y="658" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700">${escapeXml(fromB)}</text>
  <text x="430" y="640" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">To</text>
  <text x="488" y="640" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700">${escapeXml(toA)}</text>
  <text x="488" y="658" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700">${escapeXml(toB)}</text>
  <text x="56" y="692" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="12">Tx hash</text>
  <text x="128" y="692" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700">${escapeXml(hashA)}</text>
  <text x="128" y="710" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700">${escapeXml(hashB)}</text>
  <text x="650" y="710" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700">Verified on Base</text>
</svg>`;
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
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
}

function combinedHistoryItems() {
  return allHistoryItems().slice(0, visibleHistoryLimit);
}

function renderHistory() {
  const items = combinedHistoryItems();
  const allItems = allHistoryItems();
  historyList.textContent = "";

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

  setHistoryStatus(`Showing ${items.length} of ${allItems.length} ${activeHistoryTab === "all" ? "transaction" : activeHistoryTab} record${items.length === 1 ? "" : "s"}.`);

  for (const item of items) {
    const button = document.createElement("button");
    const text = document.createElement("span");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const value = document.createElement("span");
    const receiptAction = document.createElement("span");
    button.type = "button";
    button.className = "history-item";
    title.textContent = safeDisplay(item.title);
    meta.className = "history-meta";
    meta.textContent = `${safeDisplay(item.subtitle, 100)} - ${formatDate(item.timestamp)}`;
    value.className = "history-value";
    value.textContent = safeDisplay(item.value, 48);
    receiptAction.className = "history-receipt-button";
    receiptAction.textContent = "Receipt";
    text.append(title, meta);
    button.append(text, value, receiptAction);
    button.addEventListener("click", async () => {
      await generateAndDownloadReceipt(item.hash);
    });
    historyList.appendChild(button);
  }

  loadMoreHistoryButton.hidden = visibleHistoryLimit >= allItems.length && !historyState.txNext && !historyState.transferNext;
}

async function loadHistory({ more = false } = {}) {
  if (!connectedWallet) {
    setHistoryStatus("Connect a wallet first.", "error");
    return;
  }

  try {
    if (!more) {
      visibleHistoryLimit = PAGE_SIZE;
    }
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
    if (more) {
      visibleHistoryLimit += PAGE_SIZE;
    }
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
  return "Base transaction";
}

function buildReceiptFromChain(txHash, tx, txReceipt, block) {
  const transfers = parseTransfers(txReceipt.logs || []);
  const summary = summarizeTransfers(tx, transfers);
  const gasFeeWei = hexToBigInt(txReceipt.gasUsed) * hexToBigInt(txReceipt.effectiveGasPrice || tx.gasPrice);
  const ethValue = hexToBigInt(tx.value);
  const success = txReceipt.status === "0x1";
  const sender = tx.from.toLowerCase();
  const explorerUrl = `https://basescan.org/tx/${txHash}`;

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
      detail: "Base network fee",
    },
  ];

  return {
    id: `or_base_${txHash.slice(2, 10)}`,
    title: inferTitle(summary, tx),
    app: tx.to ? shortHash(tx.to) : "Contract creation",
    network: "Base",
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

function setWallet(address, chainId) {
  connectedWallet = address || null;
  walletLabel.textContent = address ? `${shortHash(address)} - chain ${parseInt(chainId || "0x0", 16)}` : "Not connected";
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

    const block = await rpc("eth_getBlockByNumber", [txReceipt.blockNumber, false]);
    receipt = buildReceiptFromChain(txHash, tx, txReceipt, block);
    try {
      receipt.qrDataUrl = await fetchQrDataUrl(receipt.explorerUrl);
    } catch {
      receipt.qrDataUrl = "";
    }
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
      canvas.height = 1520;
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
