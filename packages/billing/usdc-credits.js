const BASE_CHAIN_ID = 8453;
const BASE_USDC_ADDRESS = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const USDC_DECIMALS = 6n;
const CREDITS_PER_USDC = 1000n;
const MIN_TOP_UP_USDC = "5";
const MAX_AUTO_TOP_UP_USDC = "10000";
const REQUIRED_CONFIRMATIONS = 3;

function normalizeAddress(address) {
  return String(address || "").toLowerCase();
}

function parseUsdcUnits(amount) {
  const value = String(amount || "").trim();
  if (!/^\d+(\.\d{1,6})?$/.test(value)) {
    throw new Error("Invalid USDC amount.");
  }

  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** USDC_DECIMALS
    + BigInt(fraction.padEnd(Number(USDC_DECIMALS), "0"));
}

function formatUsdcUnits(units) {
  const base = 10n ** USDC_DECIMALS;
  const whole = units / base;
  const fraction = (units % base).toString().padStart(Number(USDC_DECIMALS), "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function creditsForUsdc(amount) {
  const units = parseUsdcUnits(amount);
  const credits = (units * CREDITS_PER_USDC) / (10n ** USDC_DECIMALS);
  if (credits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Credit amount exceeds safe integer range.");
  }
  return Number(credits);
}

function toNonNegativeInteger(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return NaN;
}

function validateTopUpTransfer(transfer, config) {
  const reasons = [];
  const minUnits = parseUsdcUnits(config.minTopUpUsdc || MIN_TOP_UP_USDC);
  const maxUnits = parseUsdcUnits(config.maxAutoTopUpUsdc || MAX_AUTO_TOP_UP_USDC);
  const transferUnits = parseUsdcUnits(transfer.amountUsdc || "0");
  const allowedSenders = new Set((config.billingWallets || []).map(normalizeAddress));
  const creditedTxHashes = new Set((config.creditedTxHashes || []).map(value => String(value).toLowerCase()));
  const tokenAddress = normalizeAddress(transfer.tokenAddress);
  const treasuryAddress = normalizeAddress(config.treasuryAddress);
  const sender = normalizeAddress(transfer.fromAddress);
  const recipient = normalizeAddress(transfer.toAddress);
  const txHash = String(transfer.txHash || "").toLowerCase();

  if (toNonNegativeInteger(transfer.chainId) !== BASE_CHAIN_ID) reasons.push("wrong_network");
  if (tokenAddress !== BASE_USDC_ADDRESS) reasons.push("wrong_token");
  if (!treasuryAddress || recipient !== treasuryAddress) reasons.push("wrong_recipient");
  if (!allowedSenders.has(sender)) reasons.push("unregistered_billing_wallet");
  if (transferUnits < minUnits) reasons.push("below_minimum_topup");
  if (transferUnits > maxUnits) reasons.push("requires_manual_review");
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) reasons.push("invalid_tx_hash");
  if (creditedTxHashes.has(txHash)) reasons.push("duplicate_tx_hash");
  const confirmations = toNonNegativeInteger(transfer.confirmations || 0);
  if (!Number.isFinite(confirmations) || confirmations < (config.requiredConfirmations || REQUIRED_CONFIRMATIONS)) {
    reasons.push("insufficient_confirmations");
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    amountUsdc: formatUsdcUnits(transferUnits),
    creditAmount: reasons.length === 0 ? creditsForUsdc(formatUsdcUnits(transferUnits)) : 0,
  };
}

module.exports = {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  CREDITS_PER_USDC: Number(CREDITS_PER_USDC),
  MAX_AUTO_TOP_UP_USDC,
  MIN_TOP_UP_USDC,
  REQUIRED_CONFIRMATIONS,
  creditsForUsdc,
  formatUsdcUnits,
  parseUsdcUnits,
  validateTopUpTransfer,
};
