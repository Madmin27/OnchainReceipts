import assert from "node:assert";
import {
  BASE_CHAIN_ID,
  BASE_USDC_ADDRESS,
  CREDIT_OVERDRAFT_LIMIT,
  canSpendCredit,
  creditsForUsdc,
  validateObservedTransfer,
  validateTopUpIntent,
} from "../apps/api/src/billing.mjs";

const treasuryAddress = "0x1111111111111111111111111111111111111111";
const billingWallet = "0x2222222222222222222222222222222222222222";
const validTransfer = {
  chainId: BASE_CHAIN_ID,
  tokenAddress: BASE_USDC_ADDRESS,
  fromAddress: billingWallet,
  toAddress: treasuryAddress,
  amountUsdc: "10",
  txHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  confirmations: 3,
};

assert.equal(CREDIT_OVERDRAFT_LIMIT, -10);
assert.equal(canSpendCredit(0, 1), true);
assert.equal(canSpendCredit(-9, 1), true);
assert.equal(canSpendCredit(-10, 1), false);
assert.equal(creditsForUsdc("5"), 5000);

assert.deepEqual(validateTopUpIntent({ amountUsdc: "5", billingWallet }), {
  accepted: true,
  reasons: [],
  creditAmount: 5000,
});

assert(validateTopUpIntent({ amountUsdc: "4.999999", billingWallet }).reasons.includes("below_minimum_topup"));
assert(validateTopUpIntent({ amountUsdc: "10000.01", billingWallet }).reasons.includes("requires_manual_review"));
assert(validateTopUpIntent({ amountUsdc: "10", billingWallet: "not-a-wallet" }).reasons.includes("invalid_billing_wallet"));

const accepted = validateObservedTransfer(validTransfer, {
  treasuryAddress,
  billingWallets: [billingWallet],
  creditedTxHashes: [],
});
assert.equal(accepted.accepted, true);
assert.equal(accepted.creditAmount, 10000);

assert(validateObservedTransfer({ ...validTransfer, tokenAddress: "0x4200000000000000000000000000000000000006" }, {
  treasuryAddress,
  billingWallets: [billingWallet],
  creditedTxHashes: [],
}).reasons.includes("wrong_token"));

assert(validateObservedTransfer(validTransfer, {
  treasuryAddress,
  billingWallets: [billingWallet],
  creditedTxHashes: [validTransfer.txHash],
}).reasons.includes("duplicate_tx_hash"));

console.log("API billing automation tests passed.");
