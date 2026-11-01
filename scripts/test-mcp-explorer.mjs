import assert from "node:assert";
import {
  ROUTESCAN_CHAINS,
  etherscanActionForPath,
  explorerSources,
  normalizeEtherscanTokenTx,
  normalizeEtherscanTx,
  routescanBaseUrl,
} from "../packages/mcp-server/src/explorer.mjs";

const base = { id: "base", name: "Base", chainId: 8453, blockscoutUrl: "https://base.blockscout.com" };
const eth = { id: "ethereum", name: "Ethereum", chainId: 1, blockscoutUrl: "https://eth.blockscout.com" };

// Source ordering: Blockscout first, keyless Routescan where available, Etherscan only with a key
assert.deepEqual(explorerSources(base, {}).map(s => s.kind), ["blockscout"]);
assert.deepEqual(explorerSources(eth, {}).map(s => s.kind), ["blockscout", "etherscan"]);
assert.deepEqual(explorerSources(base, { TX_RECEIPTS_ETHERSCAN_API_KEY: "k" }).map(s => s.kind), ["blockscout", "etherscan"]);
assert.equal(explorerSources(base, { TX_RECEIPTS_ETHERSCAN_API_KEY: "k" })[1].chainId, 8453);
assert.equal(routescanBaseUrl(8453), null);
assert.equal(routescanBaseUrl(137), null);
assert.ok(routescanBaseUrl(1).includes("/1/"));
assert.ok(ROUTESCAN_CHAINS.has(1));

assert.equal(etherscanActionForPath("/api/v2/addresses/0xabc/transactions"), "txlist");
assert.equal(etherscanActionForPath("/api/v2/addresses/0xabc/token-transfers"), "tokentx");
assert.equal(etherscanActionForPath("/api/v2/transactions/0xabc"), null);

// Normalisation of a real Routescan row shape
const tx = normalizeEtherscanTx({
  blockNumber: "26318906", timeStamp: "1793523899", hash: "0xABC", from: "0x95222290dd7278aa3ddd389cc1e1d165cc4bafe5",
  to: "0xfeeeeee44046c3f61a8cc081e0918ef0de0a7ffc", value: "9083482218334669", gas: "30000", gasPrice: "49134120",
  gasUsed: "21000", isError: "0", txreceipt_status: "1", input: "0x6ae700bb", functionName: "transferWithMemo(bytes)",
});
assert.equal(tx.hash, "0xabc");
assert.equal(tx.timestamp, new Date(1793523899 * 1000).toISOString());
assert.equal(tx.from.hash, "0x95222290dd7278aa3ddd389cc1e1d165cc4bafe5");
assert.equal(tx.fee.value, String(21000n * 49134120n));
assert.equal(tx.method, "transferWithMemo");
assert.equal(tx.status, "ok");
assert.equal(normalizeEtherscanTx({ isError: "1", input: "0x", value: "0" }).status, "error");
assert.equal(normalizeEtherscanTx({ input: "0x", value: "0" }).method, "transfer");
assert.equal(normalizeEtherscanTx({ input: "0xa9059cbb0000", value: "0" }).method, "0xa9059cbb");

const tt = normalizeEtherscanTokenTx({
  hash: "0xDEF", timeStamp: "1793523899", from: "0x1", to: "0x2", contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  tokenSymbol: "USDC", tokenName: "USD Coin", tokenDecimal: "6", value: "903140",
});
assert.equal(tt.transaction_hash, "0xdef");
assert.equal(tt.token.address_hash, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
assert.equal(tt.total.decimals, "6");
assert.equal(tt.token_type, "ERC-20");

console.log("MCP explorer fallback tests passed.");
