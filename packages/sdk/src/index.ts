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
    this.baseUrl = options.baseUrl || "https://api.txreceipts.com.tr";
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

  private defaultIdempotencyKey(request: CreateReceiptRequest): string {
    const project = this.projectId || "project";
    return `${project}:${request.chainId}:${request.txHash.toLowerCase()}`;
  }
}
