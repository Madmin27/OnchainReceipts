const receipt = {
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
