const assert = require("assert");
const {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  creditsForUsdc,
  parseUsdcUnits,
  validateTopUpTransfer,
} = require("../packages/billing/usdc-credits");

const treasuryAddress = "0x1111111111111111111111111111111111111111";
const billingWallet = "0x2222222222222222222222222222222222222222";
const validTransfer = {
  chainId: BASE_CHAIN_ID,
  tokenAddress: BASE_USDC_ADDRESS,
  fromAddress: billingWallet,
  toAddress: treasuryAddress,
  amountUsdc: "10.50",
  txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  confirmations: 3,
};
const config = {
  treasuryAddress,
  billingWallets: [billingWallet],
  creditedTxHashes: [],
};

assert.equal(parseUsdcUnits("1.000001").toString(), "1000001");
assert.equal(creditsForUsdc("1"), 1000);
assert.equal(creditsForUsdc("10.50"), 10500);
assert.throws(() => parseUsdcUnits("1.0000001"), /Invalid USDC amount/);
assert.throws(() => parseUsdcUnits("1e6"), /Invalid USDC amount/);

assert.deepEqual(validateTopUpTransfer(validTransfer, config), {
  accepted: true,
  reasons: [],
  amountUsdc: "10.5",
  creditAmount: 10500,
});

assert(validateTopUpTransfer({ ...validTransfer, chainId: 1 }, config).reasons.includes("wrong_network"));
assert(validateTopUpTransfer({ ...validTransfer, tokenAddress: "0x4200000000000000000000000000000000000006" }, config).reasons.includes("wrong_token"));
assert(validateTopUpTransfer({ ...validTransfer, toAddress: billingWallet }, config).reasons.includes("wrong_recipient"));
assert(validateTopUpTransfer({ ...validTransfer, fromAddress: "0x3333333333333333333333333333333333333333" }, config).reasons.includes("unregistered_billing_wallet"));
assert(validateTopUpTransfer({ ...validTransfer, amountUsdc: "4.99" }, config).reasons.includes("below_minimum_topup"));
assert(validateTopUpTransfer({ ...validTransfer, amountUsdc: "10000.01" }, config).reasons.includes("requires_manual_review"));
assert(validateTopUpTransfer({ ...validTransfer, confirmations: 2 }, config).reasons.includes("insufficient_confirmations"));
assert(validateTopUpTransfer({ ...validTransfer, confirmations: "Infinity" }, config).reasons.includes("insufficient_confirmations"));
assert(validateTopUpTransfer({ ...validTransfer, txHash: "0x1234" }, config).reasons.includes("invalid_tx_hash"));
assert(validateTopUpTransfer(validTransfer, { ...config, creditedTxHashes: [validTransfer.txHash] }).reasons.includes("duplicate_tx_hash"));

const multiFailure = validateTopUpTransfer({
  ...validTransfer,
  chainId: 1,
  tokenAddress: "0x4200000000000000000000000000000000000006",
  amountUsdc: "1",
}, config);
assert.equal(multiFailure.accepted, false);
assert.equal(multiFailure.creditAmount, 0);
assert(multiFailure.reasons.length >= 3);

console.log("USDC credit validation tests passed.");
