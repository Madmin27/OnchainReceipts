export const BASE_CHAIN_ID = 8453;
export const BASE_USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
export const USDC_DECIMALS = 6n;
export const CREDITS_PER_USDC = 2000n;
export const FREE_API_REQUESTS = 1000;
export const MIN_TOP_UP_USDC = "5";
export const MAX_AUTO_TOP_UP_USDC = "10000";
export const REQUIRED_CONFIRMATIONS = 3;
export const CREDIT_OVERDRAFT_LIMIT = 0;

export function normalizeAddress(address) {
  return String(address || "").toLowerCase();
}

export function parseUsdcUnits(amount) {
  const value = String(amount || "").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(value)) {
    throw new Error("Invalid USDC amount.");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** USDC_DECIMALS
    + BigInt(fraction.padEnd(Number(USDC_DECIMALS), "0"));
}

export function formatUsdcUnits(units) {
  const base = 10n ** USDC_DECIMALS;
  const whole = units / base;
  const fraction = (units % base).toString().padStart(Number(USDC_DECIMALS), "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function creditsForUsdc(amount) {
  const credits = (parseUsdcUnits(amount) * CREDITS_PER_USDC) / (10n ** USDC_DECIMALS);
  if (credits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Credit amount exceeds safe integer range.");
  }
  return Number(credits);
}

export function canSpendCredit(balance, spend = 1, overdraftLimit = CREDIT_OVERDRAFT_LIMIT) {
  return Number(balance || 0) - Number(spend || 0) >= overdraftLimit;
}

export function validateTopUpIntent({ amountUsdc, billingWallet }) {
  const reasons = [];
  let creditAmount = 0;
  try {
    const units = parseUsdcUnits(amountUsdc);
    if (units < parseUsdcUnits(MIN_TOP_UP_USDC)) reasons.push("below_minimum_topup");
    if (units > parseUsdcUnits(MAX_AUTO_TOP_UP_USDC)) reasons.push("requires_manual_review");
    creditAmount = creditsForUsdc(amountUsdc);
  } catch {
    reasons.push("invalid_amount");
  }
  if (billingWallet && !/^0x[a-fA-F0-9]{40}$/.test(billingWallet)) {
    reasons.push("invalid_billing_wallet");
  }
  return { accepted: reasons.length === 0, reasons, creditAmount };
}

export function validateObservedTransfer(transfer, config) {
  const reasons = [];
  const allowedSenders = new Set((config.billingWallets || []).map(normalizeAddress));
  const creditedTxHashes = new Set((config.creditedTxHashes || []).map(value => String(value).toLowerCase()));
  let transferUnits = 0n;

  try {
    transferUnits = parseUsdcUnits(transfer.amountUsdc || "0");
  } catch {
    reasons.push("invalid_amount");
  }

  if (Number(transfer.chainId) !== BASE_CHAIN_ID) reasons.push("wrong_network");
  if (normalizeAddress(transfer.tokenAddress) !== BASE_USDC_ADDRESS) reasons.push("wrong_token");
  if (normalizeAddress(transfer.toAddress) !== normalizeAddress(config.treasuryAddress)) reasons.push("wrong_recipient");
  if (!allowedSenders.has(normalizeAddress(transfer.fromAddress))) reasons.push("unregistered_billing_wallet");
  if (transferUnits < parseUsdcUnits(MIN_TOP_UP_USDC)) reasons.push("below_minimum_topup");
  if (transferUnits > parseUsdcUnits(MAX_AUTO_TOP_UP_USDC)) reasons.push("requires_manual_review");
  if (!/^0x[a-f0-9]{64}$/.test(String(transfer.txHash || "").toLowerCase())) reasons.push("invalid_tx_hash");
  if (creditedTxHashes.has(String(transfer.txHash || "").toLowerCase())) reasons.push("duplicate_tx_hash");
  if (!Number.isInteger(Number(transfer.confirmations)) || Number(transfer.confirmations) < REQUIRED_CONFIRMATIONS) {
    reasons.push("insufficient_confirmations");
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    amountUsdc: formatUsdcUnits(transferUnits),
    creditAmount: reasons.length === 0 ? creditsForUsdc(formatUsdcUnits(transferUnits)) : 0,
  };
}
