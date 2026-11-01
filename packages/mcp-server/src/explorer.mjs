// Explorer data sources. Blockscout v2 is the primary source; when it is unreachable
// (Cloudflare challenge, outage, timeout) we fall back to Etherscan-compatible APIs and
// normalise their rows into the Blockscout item shape the tools already understand.

import { fetchJsonSafe } from "./safe.mjs";

/**
 * Routescan's keyless Etherscan-compatible API answers for these chains only
 * (verified 2026-11-01: Base, Optimism, Arbitrum and Polygon return "chain not supported").
 */
export const ROUTESCAN_CHAINS = new Set([1]);

export function routescanBaseUrl(chainId) {
  return ROUTESCAN_CHAINS.has(Number(chainId))
    ? `https://api.routescan.io/v2/network/mainnet/evm/${Number(chainId)}/etherscan/api`
    : null;
}

export function etherscanV2BaseUrl() {
  return "https://api.etherscan.io/v2/api";
}

/** Ordered list of explorer sources for a network. Blockscout first, then keyless, then keyed. */
export function explorerSources(config, env = process.env) {
  const sources = [{ kind: "blockscout", label: `${config.name} Blockscout`, baseUrl: config.blockscoutUrl }];
  const routescan = routescanBaseUrl(config.chainId);
  if (routescan) sources.push({ kind: "etherscan", label: `${config.name} Routescan`, baseUrl: routescan, apiKey: null, chainId: null });
  const etherscanKey = env.TX_RECEIPTS_ETHERSCAN_API_KEY || "";
  if (etherscanKey) sources.push({ kind: "etherscan", label: `${config.name} Etherscan`, baseUrl: etherscanV2BaseUrl(), apiKey: etherscanKey, chainId: config.chainId });
  return sources;
}

export function etherscanActionForPath(path) {
  if (/\/transactions$/.test(path)) return "txlist";
  if (/\/token-transfers$/.test(path)) return "tokentx";
  return null;
}

function isoFromUnix(seconds) {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

function methodFromRow(row) {
  const fn = String(row.functionName || "").split("(")[0].trim();
  if (fn) return fn;
  const input = String(row.input || "0x");
  return input !== "0x" && input.length >= 10 ? input.slice(0, 10) : "transfer";
}

/** Etherscan `txlist` row -> Blockscout v2 transaction item (fields the tools read). */
export function normalizeEtherscanTx(row) {
  const gasUsed = BigInt(String(row.gasUsed || "0").replace(/\D/g, "") || "0");
  const gasPrice = BigInt(String(row.gasPrice || "0").replace(/\D/g, "") || "0");
  const feeWei = gasUsed * gasPrice;
  const failed = String(row.isError) === "1" || String(row.txreceipt_status) === "0";
  return {
    hash: String(row.hash || "").toLowerCase(),
    timestamp: isoFromUnix(row.timeStamp),
    from: { hash: row.from || null },
    to: { hash: row.to || row.contractAddress || null },
    value: String(row.value || "0"),
    fee: { value: feeWei.toString(), wei: feeWei.toString() },
    gas_used: String(row.gasUsed || ""),
    gas_price: String(row.gasPrice || ""),
    method: methodFromRow(row),
    status: failed ? "error" : "ok",
    result: failed ? "fail" : "success",
    block_number: Number(row.blockNumber || 0) || null,
    source: "etherscan",
  };
}

/** Etherscan `tokentx` row -> Blockscout v2 token-transfer item. */
export function normalizeEtherscanTokenTx(row) {
  const decimals = String(row.tokenDecimal ?? "18");
  return {
    transaction_hash: String(row.hash || "").toLowerCase(),
    timestamp: isoFromUnix(row.timeStamp),
    from: { hash: row.from || null },
    to: { hash: row.to || null },
    token: {
      address_hash: row.contractAddress || null,
      symbol: row.tokenSymbol || null,
      name: row.tokenName || null,
      decimals,
      type: "ERC-20",
    },
    token_type: "ERC-20",
    total: { value: String(row.value || "0"), decimals },
    source: "etherscan",
  };
}

/** Fetch up to `limit` rows from an Etherscan-compatible source. Returns Blockscout-shaped items. */
export async function fetchEtherscanItems(source, address, path, limit) {
  const action = etherscanActionForPath(path);
  if (!action) throw new Error(`No Etherscan equivalent for ${path}.`);
  const url = new URL(source.baseUrl);
  if (source.chainId) url.searchParams.set("chainid", String(source.chainId));
  url.searchParams.set("module", "account");
  url.searchParams.set("action", action);
  url.searchParams.set("address", address);
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", String(Math.min(Math.max(limit, 1), 1000)));
  url.searchParams.set("sort", "desc");
  if (source.apiKey) url.searchParams.set("apikey", source.apiKey);
  const { response, payload } = await fetchJsonSafe(url, { headers: { Accept: "application/json" } }, { label: source.label });
  if (!response.ok) throw new Error(`${source.label} error ${response.status}.`);
  const rows = Array.isArray(payload?.result) ? payload.result : [];
  if (String(payload?.status) !== "1" && rows.length === 0 && !/no transactions found/i.test(String(payload?.message || payload?.result || ""))) {
    throw new Error(`${source.label} returned no data.`);
  }
  const items = action === "txlist" ? rows.map(normalizeEtherscanTx) : rows.map(normalizeEtherscanTokenTx);
  return { items: items.slice(0, limit), truncated: rows.length > limit, pagesFetched: 1, pageSize: limit, source: source.label };
}
