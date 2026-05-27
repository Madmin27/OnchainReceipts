export type ReceiptStatus = "verified" | "partial" | "mismatch" | "failed";

export type IntentAsset = {
  symbol: string;
  amount: string;
  address?: string;
  decimals?: number;
};

export type IntentFee = {
  type: "app" | "protocol" | "network" | "merchant" | "other";
  symbol: string;
  amount: string;
  recipient?: string;
};

export type CreateReceiptRequest = {
  chainId: number;
  txHash: string;
  user?: string;
  idempotencyKey?: string;
  intent: {
    type: "transfer" | "swap" | "mint" | "payment" | "subscription" | "bridge" | "approval" | "unknown";
    summary: string;
    sent?: IntentAsset[];
    received?: IntentAsset[];
    fees?: IntentFee[];
  };
  merchant?: {
    name?: string;
    reference?: string;
    url?: string;
  };
  metadata?: Record<string, string | number | boolean | null>;
};

export type CreateReceiptResponse = {
  receiptId: string;
  status: ReceiptStatus;
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

export type CreateCreditTopUpRequest = {
  projectId?: string;
  amountUsdc: string;
  billingWallet?: string;
};

export type CreditTopUp = {
  paymentId: string;
  status: "created" | "waiting_for_payment" | "detected" | "confirmed" | "credited" | "expired" | "rejected";
  network: "base";
  chainId: 8453;
  token: {
    symbol: "USDC";
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    decimals: 6;
  };
  amountUsdc: string;
  creditAmount: number;
  receivingAddress: string;
  billingWallet?: string;
  expiresAt: string;
  txHash?: string;
};

export type TxReceiptsOptions = {
  apiKey: string;
  baseUrl?: string;
  projectId?: string;
};

export class TxReceipts {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly projectId?: string;

  constructor(options: TxReceiptsOptions) {
    if (!options.apiKey) {
      throw new Error("TxReceipts requires an API key.");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || "https://txreceipts-api.evpc77.workers.dev";
    this.projectId = options.projectId;
  }

  async createReceipt(request: CreateReceiptRequest): Promise<CreateReceiptResponse> {
    const idempotencyKey = request.idempotencyKey || this.defaultIdempotencyKey(request);
    const response = await fetch(`${this.baseUrl}/v1/receipts`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`TxReceipts API error ${response.status}: ${message}`);
    }

    return response.json() as Promise<CreateReceiptResponse>;
  }

  async getReceipt(receiptId: string): Promise<CreateReceiptResponse> {
    const response = await fetch(`${this.baseUrl}/v1/receipts/${encodeURIComponent(receiptId)}`, {
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`TxReceipts API error ${response.status}: ${message}`);
    }

    return response.json() as Promise<CreateReceiptResponse>;
  }

  async createCreditTopUp(request: CreateCreditTopUpRequest): Promise<CreditTopUp> {
    const response = await fetch(`${this.baseUrl}/v1/credits/topups`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId: request.projectId || this.projectId,
        amountUsdc: request.amountUsdc,
        billingWallet: request.billingWallet,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`TxReceipts API error ${response.status}: ${message}`);
    }

    return response.json() as Promise<CreditTopUp>;
  }

  async getCreditTopUp(paymentId: string): Promise<CreditTopUp> {
    const response = await fetch(`${this.baseUrl}/v1/credits/topups/${encodeURIComponent(paymentId)}`, {
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`TxReceipts API error ${response.status}: ${message}`);
    }

    return response.json() as Promise<CreditTopUp>;
  }

  private defaultIdempotencyKey(request: CreateReceiptRequest): string {
    const project = this.projectId || "project";
    return `${project}:${request.chainId}:${request.txHash.toLowerCase()}`;
  }
}
