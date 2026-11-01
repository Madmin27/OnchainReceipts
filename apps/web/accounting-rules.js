/*
 * TxReceipts accounting rules.
 *
 * Pure classification logic shared by the browser app (window.TxReceiptsAccounting)
 * and the Node test suite (scripts/test-accounting-rules.mjs). Keep this file free of
 * DOM, network and storage access so every rule can be exercised with fixtures.
 *
 * Input is a normalized history item as produced by app.js normalizeTx/normalizeTransfer:
 *   { kind: "tx" | "token" | "nft", hash, title, subtitle, value, direction, usdValue?, timestamp }
 * `override` is the user's manual correction for that hash: { category?, direction?, memo? } | null.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.TxReceiptsAccounting = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CATEGORIES = [
    "app_fee", "protocol_fee", "swap", "subscription", "creator_payment", "refund", "gas_fee",
    "authorization", "contract_deployment", "contract_call", "internal_transfer", "uncategorized",
  ];
  const DIRECTIONS = ["income", "expense", "swap", "transfer", "unknown"];

  function itemText(item) {
    return `${item.title || ""} ${item.subtitle || ""} ${item.value || ""}`.toLowerCase();
  }

  function isFailed(item) {
    return /failed|error/.test(itemText(item));
  }

  function hasUnknownCounterparty(item) {
    return /unknown/i.test(String(item.subtitle || ""));
  }

  function hasSuspiciousTokenSignals(item) {
    if (item.kind !== "token") return false;
    return /scam|telegram|t\.me|claim|airdrop|bonus|reward|free token|visit|http|www\./.test(itemText(item));
  }

  function hasMissingValuation(item) {
    return item.kind === "token" && !(Number(item.usdValue) > 0);
  }

  function categoryForItem(item, override) {
    if (override && override.category) return override.category;
    const text = itemText(item);
    if (/failed|error/.test(text)) return "uncategorized";
    if (/app fee|service fee|platform fee/.test(text)) return "app_fee";
    if (/protocol fee|bridge fee|router fee|lp fee/.test(text)) return "protocol_fee";
    if (/swap|exchange|router/.test(text)) return "swap";
    if (/subscription|renew/.test(text)) return "subscription";
    if (/creator|support|mint/.test(text)) return "creator_payment";
    if (/refund/.test(text)) return "refund";
    if (/fee|gas/.test(text)) return "gas_fee";
    if (/approve|approval|allowance/.test(text)) return "authorization";
    if (/deploy|contract creation|create contract/.test(text)) return "contract_deployment";
    if (item.kind === "token" && hasSuspiciousTokenSignals(item)) return "uncategorized";
    if (/claim|register|contract call|multicall/.test(text)) return "contract_call";
    if (item.direction === "incoming") return "uncategorized";
    if (item.direction === "outgoing") return "uncategorized";
    if (item.direction === "other") return "uncategorized";
    return "internal_transfer";
  }

  function directionForItem(item, override) {
    if (override && override.direction) return override.direction;
    const category = categoryForItem(item, override);
    if (category === "swap") return "swap";
    if (category === "internal_transfer") return "transfer";
    if (category === "gas_fee" || item.direction === "outgoing") return "expense";
    if (item.direction === "incoming") return "income";
    return "unknown";
  }

  function reviewReasonForItem(item, category, override) {
    if (override && (override.category || override.direction)) return "";
    const text = itemText(item);
    if (/failed|error/.test(text)) return "Onchain execution failed";
    if (hasSuspiciousTokenSignals(item)) return "Suspicious or promotional token requires manual review";
    if (/approve|approval|allowance/.test(text)) return "Approval only; classify manually";
    if (/deploy|contract creation|create contract/.test(text)) return "Contract deployment requires classification";
    if (/claim|register|contract call|multicall/.test(text)) return "Contract call requires classification";
    if (hasUnknownCounterparty(item)) return "Unknown counterparty";
    if (item.kind === "token" && item.direction === "incoming") return "Incoming token requires classification";
    if (item.kind === "token" && item.direction === "outgoing") return "Outgoing token requires classification";
    if (String(item.value || "").trim().toLowerCase() === "ok") return "No asset movement detected";
    if (hasMissingValuation(item)) return "Token valuation unavailable";
    if (category === "uncategorized" || item.direction === "other") return "Transaction requires manual classification";
    return "";
  }

  function metaForItem(item, options) {
    const override = (options && options.override) || null;
    const networkName = (options && options.networkName) || "selected network";
    const category = categoryForItem(item, override);
    const direction = directionForItem(item, override);
    const verificationStatus = /failed|error/i.test(`${item.title || ""} ${item.value || ""}`) ? "failed" : "verified";
    const reviewReason = reviewReasonForItem(item, category, override);
    const status = verificationStatus === "failed" ? "failed" : (reviewReason ? "review" : "ready");
    return {
      direction,
      category,
      status,
      verificationStatus,
      reviewReason,
      missingValuation: hasMissingValuation(item),
      hasUnknownCounterparty: hasUnknownCounterparty(item),
      memo: (override && override.memo) || (reviewReason || `${category.replace(/_/g, " ")} ready from loaded ${networkName} row`),
    };
  }

  return {
    CATEGORIES,
    DIRECTIONS,
    isFailed,
    hasUnknownCounterparty,
    hasSuspiciousTokenSignals,
    hasMissingValuation,
    categoryForItem,
    directionForItem,
    reviewReasonForItem,
    metaForItem,
  };
});
