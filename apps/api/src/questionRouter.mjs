const TEMPLATE_PATTERNS = [
  /gas|fee|ucret|ücret|komisyon|masraf/i,
  /uncategorized|kategorisiz/i,
  /app fee|protocol fee|subscription/i,
  /largest expense|top expense|en buyuk gider|en büyük gider/i,
  /income|expense|gelir|gider/i,
  /export|csv|pdf/i,
];

const TRANSACTION_SIGNALS = [
  /what happened|transaction summary|summarize this transaction/i,
  /why|how|which|who|when|where|how much|how many/i,
  /neden|nasıl|hangi|kim|ne kadar|kaç|açıkla|incele|detay/i,
];

export function normalizeQuestion(question) {
  return String(question || "").trim().toLowerCase();
}

export function detectQuestionRoute(question, context = {}) {
  const text = normalizeQuestion(question);
  const hasSelectedTx = Boolean(context.selectedTx || context.selectedReceipt || context.selectedLedgerRow);
  if (TEMPLATE_PATTERNS.some(pattern => pattern.test(text))) {
    return {
      scope: hasSelectedTx ? "transaction" : "wallet",
      strategy: "template-first",
      reason: "deterministic-accounting-question",
    };
  }
  if (hasSelectedTx && TRANSACTION_SIGNALS.some(pattern => pattern.test(text))) {
    return {
      scope: "transaction",
      strategy: "ai-fallback",
      reason: "selected-transaction-context",
    };
  }
  return {
    scope: hasSelectedTx ? "transaction" : "wallet",
    strategy: "ai-fallback",
    reason: "compact-accounting-analysis",
  };
}

export function routingNote(route) {
  return `Route scope=${route.scope}; strategy=${route.strategy}; reason=${route.reason}.`;
}
