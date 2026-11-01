// Fixture tests for the pre-accounting classification rules used by the web app.
// Each fixture is a normalized history item exactly as app.js builds it, plus the
// classification an accountant would expect. A rule change that alters any of these
// must update the fixture on purpose.
import assert from "node:assert";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rules = require("../apps/web/accounting-rules.js");

const H = "0x" + "ab".repeat(32);
const tx = (overrides) => ({ kind: "tx", hash: H, title: "Outgoing transaction", subtitle: "0x1234...abcd -> 0x9876...fedc", value: "0.5 ETH", direction: "outgoing", timestamp: "2026-10-03T10:00:00Z", ...overrides });
const token = (overrides) => ({ kind: "token", hash: H, title: "Outgoing ERC-20", subtitle: "0x1234...abcd -> 0x9876...fedc", value: "120 USDC", direction: "outgoing", usdValue: 120, ...overrides });

const fixtures = [
  // [name, item, override, expected]
  ["plain outgoing ETH transfer needs classification", tx(), null,
    { category: "uncategorized", direction: "expense", status: "review", reviewReason: "Transaction requires manual classification" }],
  ["plain incoming ETH transfer is income but still reviewed", tx({ title: "Incoming transaction", direction: "incoming" }), null,
    { category: "uncategorized", direction: "income", status: "review" }],
  ["swap by method name is ready", tx({ title: "Outgoing swapExactTokensForETH" }), null,
    { category: "swap", direction: "swap", status: "ready", reviewReason: "" }],
  ["router counterparty counts as swap", tx({ subtitle: "0x1234...abcd -> Uniswap Router" }), null,
    { category: "swap", direction: "swap" }],
  ["approval is authorization and reviewed", tx({ title: "Outgoing approve", value: "ok" }), null,
    { category: "authorization", direction: "expense", status: "review", reviewReason: "Approval only; classify manually" }],
  ["failed execution is failed, never ready", tx({ value: "error" }), null,
    { category: "uncategorized", verificationStatus: "failed", status: "failed", reviewReason: "Onchain execution failed" }],
  ["failed status string from explorer", tx({ title: "Outgoing transaction", value: "failed" }), null,
    { verificationStatus: "failed", status: "failed" }],
  ["contract deployment", tx({ title: "Contract contract creation", direction: "other" }), null,
    { category: "contract_deployment", direction: "unknown", status: "review", reviewReason: "Contract deployment requires classification" }],
  ["multicall contract call", tx({ title: "Outgoing multicall" }), null,
    { category: "contract_call", direction: "expense", status: "review", reviewReason: "Contract call requires classification" }],
  ["subscription renewal is ready", tx({ title: "Outgoing renewSubscription" }), null,
    { category: "subscription", direction: "expense", status: "ready", reviewReason: "" }],
  ["unknown counterparty is flagged", tx({ subtitle: "0x1234...abcd -> Unknown" }), null,
    { hasUnknownCounterparty: true, status: "review", reviewReason: "Unknown counterparty" }],
  ["zero-movement contract interaction", tx({ value: "ok" }), null,
    { status: "review", reviewReason: "No asset movement detected" }],
  ["outgoing stablecoin payment is expense, awaits accountant", token(), null,
    { category: "uncategorized", direction: "expense", status: "review", reviewReason: "Outgoing token requires classification", missingValuation: false }],
  ["incoming stablecoin is income, awaits accountant", token({ title: "Incoming ERC-20", direction: "incoming" }), null,
    { category: "uncategorized", direction: "income", status: "review", reviewReason: "Incoming token requires classification" }],
  ["promotional airdrop token is suspicious", token({ title: "Incoming ERC-20", direction: "incoming", value: "5000 Visit t.me/claim-bonus" }), null,
    { category: "uncategorized", status: "review", reviewReason: "Suspicious or promotional token requires manual review" }],
  ["scam marker in token name", token({ title: "Incoming ERC-20", direction: "incoming", value: "1 FREE TOKEN www.x.io" }), null,
    { reviewReason: "Suspicious or promotional token requires manual review" }],
  ["lookalike native/stablecoin token is suspicious", token({ title: "Incoming ERC-20", direction: "incoming", value: "42 ETH (unverified token)", usdValue: 0 }), null,
    { category: "uncategorized", status: "review", reviewReason: "Suspicious or promotional token requires manual review" }],
  ["token without price has missing valuation", token({ usdValue: 0 }), null,
    { missingValuation: true, status: "review" }],
  ["NFT mint is creator payment", { kind: "nft", hash: H, title: "Incoming ERC-721", subtitle: "Zora Mint -> 0x1234...abcd", value: "#42", direction: "incoming" }, null,
    { category: "creator_payment", direction: "income" }],
  ["user override wins and clears review", token(), { category: "subscription", direction: "expense", memo: "Monthly SaaS" }, 
    { category: "subscription", direction: "expense", status: "ready", reviewReason: "", memo: "Monthly SaaS" }],
  ["override category only still derives direction from override-free rules", tx(), { category: "refund" }, 
    { category: "refund", direction: "expense", status: "ready" }],
  ["failed tx stays failed even with override", tx({ value: "error" }), { category: "swap" }, 
    { category: "swap", status: "failed", verificationStatus: "failed" }],
];

let failures = 0;
for (const [name, item, override, expected] of fixtures) {
  const meta = rules.metaForItem(item, { override, networkName: "Base" });
  for (const [key, value] of Object.entries(expected)) {
    if (value === undefined) continue;
    try {
      assert.strictEqual(meta[key], value, `${name}: ${key}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${name}: ${key} expected ${JSON.stringify(value)} got ${JSON.stringify(meta[key])}`);
    }
  }
}

// Invariants that must hold for every fixture
for (const [name, item, override] of fixtures) {
  const meta = rules.metaForItem(item, { override });
  assert.ok(rules.CATEGORIES.includes(meta.category), `${name}: unknown category ${meta.category}`);
  assert.ok(rules.DIRECTIONS.includes(meta.direction), `${name}: unknown direction ${meta.direction}`);
  assert.ok(["ready", "review", "failed"].includes(meta.status), `${name}: unknown status`);
  if (meta.status === "ready") assert.strictEqual(meta.reviewReason, "", `${name}: ready rows must have no review reason`);
  if (meta.verificationStatus === "failed") assert.strictEqual(meta.status, "failed", `${name}: failed rows can never be ready`);
}

// Memo falls back to a sentence that names the network
assert.match(rules.metaForItem(tx({ title: "Outgoing swap" }), { networkName: "Polygon" }).memo, /Polygon/);

if (failures > 0) {
  console.error(`${failures} accounting rule assertion(s) failed.`);
  process.exit(1);
}
console.log(`Accounting rule fixtures passed (${fixtures.length} fixtures).`);
