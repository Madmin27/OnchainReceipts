# TxReceipts SDK

Draft TypeScript SDK for dapps that want to issue verified transaction receipts.

## Install

```sh
npm install @txreceipts/sdk
```

The package is not published yet. This folder defines the intended public API.

## Basic usage

```ts
import { TxReceipts } from "@txreceipts/sdk";

const txReceipts = new TxReceipts({
  apiKey: process.env.TX_RECEIPTS_API_KEY,
});

const receipt = await txReceipts.createReceipt({
  chainId: 8453,
  txHash: "0x...",
  user: "0x...",
  intent: {
    type: "swap",
    summary: "Swap 25 USDC for ETH",
    sent: [{ symbol: "USDC", amount: "25.00" }],
    received: [{ symbol: "ETH", amount: "0.0068" }],
    fees: [{ type: "app", symbol: "USDC", amount: "0.03" }],
  },
  merchant: {
    name: "ExampleSwap",
    reference: "order_123",
  },
});

console.log(receipt.receiptId);
console.log(receipt.credit.counted);
console.log(receipt.artifacts.pngUrl);
```

## Credit behavior

The SDK sends an idempotency key derived from:

```txt
project_id:chain_id:tx_hash
```

Retries for the same transaction should return the same receipt and should not spend another credit.

## Response shape

```ts
type CreateReceiptResponse = {
  receiptId: string;
  status: "verified" | "partial" | "mismatch" | "failed";
  credit: {
    counted: boolean;
    amount: number;
    reason: string;
    remaining?: number;
  };
  artifacts: {
    pngUrl?: string;
    jsonUrl?: string;
    pdfUrl?: string;
  };
  verification: {
    checks: Array<{
      name: string;
      status: "pass" | "warn" | "fail";
      observed?: string;
      expected?: string;
    }>;
  };
};
```

## Safety rules

- The SDK never asks for private keys.
- The SDK never asks for token approvals.
- The SDK should be called from a backend when using a secret API key.
- Browser usage must use a publishable project key with strict origin limits.
