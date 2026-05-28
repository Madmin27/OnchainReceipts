export type AccountingDirection = "income" | "expense" | "swap" | "transfer" | "fee" | "unknown";

export type AccountingCategory =
  | "sales"
  | "purchase"
  | "subscription"
  | "creator_payment"
  | "swap"
  | "gas_fee"
  | "protocol_fee"
  | "app_fee"
  | "refund"
  | "internal_transfer"
  | "uncategorized";

export type AccountingFeeBreakdown = {
  gasNative?: string;
  gasUsd?: string;
  appFeeUsd?: string;
  protocolFeeUsd?: string;
};

export type AccountingCounterparty = {
  address?: string;
  label?: string;
  type?: "wallet" | "dapp" | "contract" | "merchant";
};

export type AccountingReceipt = {
  id: string;
  network: "base" | "ethereum" | "polygon" | "arbitrum" | "optimism" | "solana";
  txHash: string;
  wallet: string;
  date: string;
  status: "success" | "failed";
  direction: AccountingDirection;
  category: AccountingCategory;
  counterparty?: AccountingCounterparty;
  sent?: Array<{ token: string; amount: string; usdValue?: string }>;
  received?: Array<{ token: string; amount: string; usdValue?: string }>;
  fees: AccountingFeeBreakdown;
  memo?: string;
  receiptUrl?: string;
  verification: {
    txSuccess: boolean;
    transfersParsed: boolean;
    dappIntentMatched?: boolean;
    confidenceScore: number;
    warnings: string[];
  };
};

export type ClassificationInput = {
  title?: string;
  subtitle?: string;
  value?: string;
  direction?: "incoming" | "outgoing" | "other";
  method?: string;
};

export function classifyTransaction(input: ClassificationInput): {
  direction: AccountingDirection;
  category: AccountingCategory;
  memo: string;
} {
  const text = `${input.title || ""} ${input.subtitle || ""} ${input.value || ""} ${input.method || ""}`.toLowerCase();
  if (/swap|exchange|router/.test(text)) return { direction: "swap", category: "swap", memo: "Swap candidate from loaded row" };
  if (/subscription|renew/.test(text)) return { direction: "expense", category: "subscription", memo: "Subscription candidate from loaded row" };
  if (/app fee|service fee|platform fee/.test(text)) return { direction: "expense", category: "app_fee", memo: "App fee candidate from loaded row" };
  if (/protocol fee|bridge fee|router fee|lp fee/.test(text)) return { direction: "expense", category: "protocol_fee", memo: "Protocol fee candidate from loaded row" };
  if (/fee|gas/.test(text)) return { direction: "fee", category: "gas_fee", memo: "Network fee candidate from loaded row" };
  if (/refund/.test(text)) return { direction: "income", category: "refund", memo: "Refund candidate from loaded row" };
  if (input.direction === "incoming") return { direction: "income", category: "sales", memo: "Incoming value candidate from loaded row" };
  if (input.direction === "outgoing") return { direction: "expense", category: "purchase", memo: "Outgoing value candidate from loaded row" };
  return { direction: "unknown", category: "uncategorized", memo: "Needs review" };
}

export function monthlySummary(receipts: AccountingReceipt[]) {
  const expenses = receipts.filter(item => item.direction === "expense");
  const income = receipts.filter(item => item.direction === "income");
  return {
    total: receipts.length,
    incoming: income.length,
    outgoing: expenses.length,
    swaps: receipts.filter(item => item.category === "swap").length,
    subscriptions: receipts.filter(item => item.category === "subscription").length,
    uncategorized: receipts.filter(item => item.category === "uncategorized").length,
    verified: receipts.filter(item => item.verification.txSuccess).length,
  };
}

export function csvExport(receipts: AccountingReceipt[]) {
  const rows = [
    ["date", "network", "txHash", "direction", "category", "counterparty", "memo", "gasNative", "appFeeUsd", "protocolFeeUsd"],
    ...receipts.map(item => [
      item.date,
      item.network,
      item.txHash,
      item.direction,
      item.category,
      item.counterparty?.label || item.counterparty?.address || "",
      item.memo || "",
      item.fees.gasNative || "",
      item.fees.appFeeUsd || "",
      item.fees.protocolFeeUsd || "",
    ]),
  ];
  return rows.map(row => row.map(cell => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function printableReceipt(receipt: AccountingReceipt) {
  return {
    heading: `TxReceipts printable note for ${receipt.txHash}`,
    summary: `${receipt.direction} / ${receipt.category} / ${receipt.status}`,
    lines: [
      `Wallet: ${receipt.wallet}`,
      `Date: ${receipt.date}`,
      `Counterparty: ${receipt.counterparty?.label || receipt.counterparty?.address || "Not available"}`,
      `Gas: ${receipt.fees.gasNative || "Not available"}`,
      `Memo: ${receipt.memo || "Not available"}`,
    ],
  };
}
