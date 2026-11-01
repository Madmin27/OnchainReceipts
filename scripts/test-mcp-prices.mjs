import assert from "node:assert";
import {
  applyPricePayload,
  cachedPrice,
  nativeCoinKey,
  priceBucket,
  pricePairsFor,
  tokenCoinKey,
  usdSpendSummary,
} from "../packages/mcp-server/src/prices.mjs";

// Buckets are hour-centred and stable
const ts = "2026-10-15T10:42:00.000Z";
const bucket = priceBucket(ts);
assert.equal(bucket % 3600, 1800);
assert.equal(priceBucket("2026-10-15T10:01:00Z"), bucket);
assert.equal(priceBucket("garbage"), null);
assert.equal(nativeCoinKey("polygon"), "coingecko:polygon-ecosystem-token");
assert.equal(nativeCoinKey("base"), "coingecko:ethereum");
assert.equal(tokenCoinKey("base", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"), "base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
assert.equal(tokenCoinKey("base", "nope"), null);

// Nearest returned point wins; unknown coins are remembered as unpriced
applyPricePayload({ coins: {
  "coingecko:ethereum": { prices: [{ timestamp: bucket + 600, price: 2500 }, { timestamp: bucket + 7200, price: 9999 }] },
  "base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { prices: [{ timestamp: bucket, price: 1 }] },
} }, [["coingecko:ethereum", bucket], ["base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", bucket], ["base:0xdead", bucket]]);
assert.equal(cachedPrice("coingecko:ethereum", ts), 2500);
assert.equal(cachedPrice("base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", ts), 1);
assert.equal(cachedPrice("base:0xdead", ts), null);

const wallet = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const txItems = [
  // outgoing 1 ETH, fee 0.001 ETH
  { hash: "0xa", timestamp: ts, from: { hash: wallet }, to: { hash: other }, value: "1000000000000000000", fee: { value: "1000000000000000" }, status: "ok" },
  // incoming 0.5 ETH (gas paid by sender, not counted)
  { hash: "0xb", timestamp: ts, from: { hash: other }, to: { hash: wallet }, value: "500000000000000000", fee: { value: "1000000000000000" }, status: "ok" },
  // failed outgoing 2 ETH: only the gas counts
  { hash: "0xc", timestamp: ts, from: { hash: wallet }, to: { hash: other }, value: "2000000000000000000", fee: { value: "2000000000000000" }, status: "error" },
  // contract call with zero value, gas only
  { hash: "0xd", timestamp: ts, from: { hash: wallet }, to: { hash: other }, value: "0", gas_used: "50000", gas_price: "20000000000", status: "ok" },
];
const transferItems = [
  // outgoing 120 USDC
  { transaction_hash: "0xe", timestamp: ts, from: { hash: wallet }, to: { hash: other }, token: { address_hash: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: "6" }, total: { value: "120000000", decimals: "6" }, token_type: "ERC-20" },
  // incoming unknown token: unpriced
  { transaction_hash: "0xf", timestamp: ts, from: { hash: other }, to: { hash: wallet }, token: { address_hash: "0x00000000000000000000000000000000000dead1", symbol: "SCAM", decimals: "18" }, total: { value: "5000000000000000000000", decimals: "18" }, token_type: "ERC-20" },
  // NFT ignored
  { transaction_hash: "0x10", timestamp: ts, from: { hash: other }, to: { hash: wallet }, token: { address_hash: "0xbeef", symbol: "NFT" }, total: { token_id: "1" }, token_type: "ERC-721" },
];
assert.deepEqual(pricePairsFor("base", txItems, transferItems).length, 4 + 2);

const usd = usdSpendSummary({ networkId: "base", wallet, txItems, transferItems, nativeSymbol: "ETH" });
assert.equal(usd.spentNativeUsd, 2500);            // 1 ETH; the failed 2 ETH is excluded
assert.equal(usd.spentNativeRows, 1);
assert.equal(usd.spentTokensUsd, 120);
assert.equal(usd.receivedNativeUsd, 1250);
assert.equal(usd.gasRows, 3);                      // 0xa, 0xc, 0xd (not the incoming 0xb)
const expectedGasEth = 0.001 + 0.002 + 50000 * 20e9 / 1e18;
assert.ok(Math.abs(usd.gasUsd - expectedGasEth * 2500) < 1e-6, `gas usd ${usd.gasUsd}`);
assert.equal(usd.unpricedRows.length, 1);
assert.equal(usd.unpricedRows[0].asset, "SCAM");
assert.ok(Math.abs(usd.spentUsd - (2500 + 120 + expectedGasEth * 2500)) < 1e-6);
assert.ok(Math.abs(usd.netUsd - (1250 - usd.spentUsd)) < 1e-6);
assert.equal(usd.gasNative, `${expectedGasEth.toFixed(6)} ETH`);

console.log("MCP pricing tests passed.");
