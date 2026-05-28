import { TxReceipts } from "../packages/sdk/src";

const receipts = new TxReceipts({
  apiKey: process.env.TX_RECEIPTS_API_KEY || "",
  projectId: "example-swap",
});

async function main() {
  const receipt = await receipts.createReceipt({
    chainId: 8453,
    txHash: "0xb9a64db56072ace1f738b2e3be4f716f28b7f6ac828b42859469b31b4eb803d0",
    ownerWallet: "0x5c728c75f4845dc19f1107a173268297908ac883",
    intent: {
      type: "swap",
      summary: "Swap 20 USDC through ExampleSwap",
      sent: [{ symbol: "USDC", amount: "20.00", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" }],
      received: [{ symbol: "WETH", amount: "0.009183" }],
      fees: [{ type: "network", symbol: "ETH", amount: "0.00000412" }],
    },
    merchant: {
      name: "ExampleSwap",
      reference: "swap_2026_05_16_001",
      url: "https://example.com",
    },
  });

  console.log(receipt.receiptId, receipt.status, receipt.credit);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
