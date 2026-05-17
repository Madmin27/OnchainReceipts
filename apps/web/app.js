let receipt = {
  id: "or_demo_base_swap_001",
  title: "USDC to ETH swap",
  app: "ExampleSwap",
  network: "Base",
  date: "May 17, 2026, 12:15",
  tx: "0x1111...1111",
  from: "demo.base.eth",
  sent: "25.00 USDC",
  received: "0.0068 ETH",
  gas: "$0.08",
  appFee: "$0.03",
  protocolFee: "$0.06",
  status: "Verified",
};

const artifact = document.querySelector("#receiptArtifact");
const svgButton = document.querySelector("#downloadSvg");
const pngButton = document.querySelector("#downloadPng");
const txForm = document.querySelector("#txForm");
const txInput = document.querySelector("#txHash");
const txStatus = document.querySelector("#txStatus");

const BASE_RPC_URL = "https://mainnet.base.org";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ETH_DECIMALS = 18n;

const knownTokens = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6n },
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18n },
  "0x4200000000000000000000000000000000000042": { symbol: "OP", decimals: 18n },
  "0x532f27101965dd16442e59d40670faf5ebb142e4": { symbol: "BRETT", decimals: 18n },
};

function escapeText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReceiptSvg(data) {
  const safe = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, escapeText(value)]));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="520" viewBox="0 0 780 520">
  <rect width="780" height="520" fill="#ffffff"/>
  <rect x="28" y="28" width="724" height="464" rx="8" fill="#ffffff" stroke="#d7ddd4"/>
  <text x="56" y="72" fill="#0052ff" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" letter-spacing="1.2">ONCHAINRECEIPTS</text>
  <text x="56" y="112" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="760">${safe.title}</text>
  <rect x="614" y="54" width="98" height="34" rx="17" fill="#e5f4ec"/>
  <text x="638" y="76" fill="#0b7a45" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="760">${safe.status}</text>

  <line x1="56" y1="148" x2="724" y2="148" stroke="#d7ddd4"/>
  <text x="56" y="188" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="13">Sent</text>
  <text x="56" y="222" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="760">${safe.sent}</text>
  <line x1="340" y1="204" x2="440" y2="204" stroke="#d7ddd4" stroke-width="2"/>
  <text x="500" y="188" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="13">Received</text>
  <text x="500" y="222" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="760">${safe.received}</text>
  <line x1="56" y1="258" x2="724" y2="258" stroke="#d7ddd4"/>

  <text x="56" y="302" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="13">App</text>
  <text x="56" y="328" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700">${safe.app}</text>
  <text x="250" y="302" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="13">Network</text>
  <text x="250" y="328" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700">${safe.network}</text>
  <text x="444" y="302" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="13">Wallet</text>
  <text x="444" y="328" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700">${safe.from}</text>

  <text x="56" y="378" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="13">Gas fee</text>
  <text x="56" y="404" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700">${safe.gas}</text>
  <text x="250" y="378" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="13">App fee</text>
  <text x="250" y="404" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700">${safe.appFee}</text>
  <text x="444" y="378" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="13">Protocol fee</text>
  <text x="444" y="404" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700">${safe.protocolFee}</text>

  <line x1="56" y1="434" x2="724" y2="434" stroke="#d7ddd4"/>
  <text x="56" y="464" fill="#5c655f" font-family="Inter, Arial, sans-serif" font-size="13">Receipt ${safe.id} · ${safe.date} · ${safe.tx}</text>
  <text x="590" y="464" fill="#111412" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700">Verified on Base</text>
</svg>`;
}

function renderArtifact() {
  artifact.innerHTML = buildReceiptSvg(receipt);
}

function setStatus(message, tone = "neutral") {
  txStatus.textContent = message;
  txStatus.dataset.tone = tone;
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
  };
}

txForm.addEventListener("submit", async event => {
  event.preventDefault();
  const txHash = txInput.value.trim();

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
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not fetch Base transaction.", "error");
  }
});

function downloadBlob(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

svgButton.addEventListener("click", () => {
  downloadBlob("onchain-receipt-demo.svg", "image/svg+xml", buildReceiptSvg(receipt));
});

pngButton.addEventListener("click", () => {
  const image = new Image();
  const svg = buildReceiptSvg(receipt);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1560;
    canvas.height = 1040;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob => {
      if (!blob) return;
      const pngUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = "onchain-receipt-demo.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(pngUrl);
    }, "image/png");
  };
  image.src = url;
});

renderArtifact();
