// Historical USD pricing for the MCP server (DefiLlama coins API, keyless).
// Mirrors apps/web/app.js: price each row at the hour of its transaction, never at "now".

import { fetchJsonSafe, safeBigInt, symbolImitates, tokenAddressOf, untrustedSymbol } from "./safe.mjs";

export const PRICE_API_URL = "https://coins.llama.fi/batchHistorical";
export const PRICE_BUCKET_SECONDS = 3600;
export const PRICE_BATCH_LIMIT = 40;

const cache = new Map(); // `${coin}@${bucket}` -> price (0 = asked, unknown)

export function priceBucket(timestamp) {
  const seconds = Math.floor(new Date(timestamp).getTime() / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.floor(seconds / PRICE_BUCKET_SECONDS) * PRICE_BUCKET_SECONDS + PRICE_BUCKET_SECONDS / 2;
}

export function nativeCoinKey(networkId) {
  return networkId === "polygon" ? "coingecko:polygon-ecosystem-token" : "coingecko:ethereum";
}

export function tokenCoinKey(networkId, address) {
  const normalized = String(address || "").toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? `${networkId}:${normalized}` : null;
}

export function cachedPrice(coinKey, timestamp) {
  const bucket = priceBucket(timestamp);
  if (!coinKey || !bucket) return null;
  const price = cache.get(`${coinKey}@${bucket}`);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** Fetch every missing (coin, hour) pair. Failures leave rows unpriced; they never throw. */
export async function loadPrices(pairs, fetchJson = fetchJsonSafe) {
  const missing = [];
  const seen = new Set();
  for (const [coinKey, timestamp] of pairs) {
    const bucket = priceBucket(timestamp);
    if (!coinKey || !bucket) continue;
    const key = `${coinKey}@${bucket}`;
    if (cache.has(key) || seen.has(key)) continue;
    seen.add(key);
    missing.push([coinKey, bucket]);
  }
  for (let index = 0; index < missing.length; index += PRICE_BATCH_LIMIT) {
    const chunk = missing.slice(index, index + PRICE_BATCH_LIMIT);
    const request = {};
    for (const [coinKey, bucket] of chunk) (request[coinKey] ||= []).push(bucket);
    try {
      const url = `${PRICE_API_URL}?coins=${encodeURIComponent(JSON.stringify(request))}&searchWidth=4h`;
      const { response, payload } = await fetchJson(url, { headers: { Accept: "application/json" } }, { label: "price API" });
      if (!response.ok) throw new Error(`price API ${response.status}`);
      applyPricePayload(payload, chunk);
    } catch {
      for (const [coinKey, bucket] of chunk) cache.set(`${coinKey}@${bucket}`, 0);
    }
  }
}

/** Store the price point nearest to each requested bucket (exported for tests). */
export function applyPricePayload(payload, chunk) {
  for (const [coinKey, bucket] of chunk) {
    const points = payload?.coins?.[coinKey]?.prices || [];
    let best = null;
    for (const point of points) {
      const distance = Math.abs(Number(point.timestamp) - bucket);
      if (Number(point.price) > 0 && distance <= 4 * PRICE_BUCKET_SECONDS && (!best || distance < best.distance)) {
        best = { price: Number(point.price), distance };
      }
    }
    cache.set(`${coinKey}@${bucket}`, best ? best.price : 0);
  }
}

function unitsToNumber(raw, decimals) {
  const value = safeBigInt(raw);
  const d = Number(decimals);
  const scale = 10n ** BigInt(Number.isInteger(d) && d >= 0 && d <= 36 ? d : 18);
  return Number(value / scale) + Number(value % scale) / Number(scale);
}

/** Collect the (coin, timestamp) pairs a set of explorer rows needs. */
export function pricePairsFor(networkId, txItems, transferItems) {
  const pairs = [];
  for (const item of txItems) if (item.timestamp) pairs.push([nativeCoinKey(networkId), item.timestamp]);
  for (const item of transferItems) {
    if (item.token_type === "ERC-721" || item.token_type === "ERC-1155") continue;
    const key = tokenCoinKey(networkId, tokenAddressOf(item));
    if (key && item.timestamp) pairs.push([key, item.timestamp]);
  }
  return pairs;
}

/**
 * USD spend summary over Blockscout-shaped rows for one wallet.
 * Spend = outgoing native transfers + outgoing token transfers + gas paid by the wallet.
 * Swaps are not identified at this layer (no classification), so token rows are reported by
 * direction and the caller labels them; failed transactions count only their gas.
 */
export function usdSpendSummary({ networkId, wallet, txItems, transferItems, nativeSymbol }, priceLookup = cachedPrice) {
  const w = String(wallet || "").toLowerCase();
  const nativeKey = nativeCoinKey(networkId);
  const out = {
    spentNativeUsd: 0, spentNativeRows: 0,
    spentTokensUsd: 0, spentTokenRows: 0,
    gasUsd: 0, gasRows: 0, gasNativeWei: 0n,
    receivedNativeUsd: 0, receivedNativeRows: 0,
    receivedTokensUsd: 0, receivedTokenRows: 0,
    unpricedRows: [],
    unpricedGasRows: 0,
  };
  for (const item of txItems) {
    const from = String(item.from?.hash || "").toLowerCase();
    const to = String(item.to?.hash || "").toLowerCase();
    const outgoing = from === w;
    const incoming = to === w && from !== w;
    const price = priceLookup(nativeKey, item.timestamp);
    const valueWei = safeBigInt(item.value);
    const failed = item.status === "error" || item.result === "fail" || item.status === "failed";
    if (outgoing) {
      const feeWei = item.fee?.value ? safeBigInt(item.fee.value) : safeBigInt(item.gas_used) * safeBigInt(item.gas_price);
      if (feeWei > 0n) {
        out.gasRows += 1;
        out.gasNativeWei += feeWei;
        if (price) out.gasUsd += unitsToNumber(feeWei, 18) * price;
        else out.unpricedGasRows += 1;
      }
    }
    if (failed || valueWei === 0n) continue;
    const amount = unitsToNumber(valueWei, 18);
    if (outgoing) {
      if (price) { out.spentNativeUsd += amount * price; out.spentNativeRows += 1; }
      else out.unpricedRows.push({ txHash: item.hash, asset: nativeSymbol, amount });
    } else if (incoming) {
      if (price) { out.receivedNativeUsd += amount * price; out.receivedNativeRows += 1; }
      else out.unpricedRows.push({ txHash: item.hash, asset: nativeSymbol, amount });
    }
  }
  for (const item of transferItems) {
    if (item.token_type === "ERC-721" || item.token_type === "ERC-1155") continue;
    const from = String(item.from?.hash || "").toLowerCase();
    const to = String(item.to?.hash || "").toLowerCase();
    const outgoing = from === w;
    const incoming = to === w && from !== w;
    if (!outgoing && !incoming) continue;
    const price = priceLookup(tokenCoinKey(networkId, tokenAddressOf(item)), item.timestamp);
    const amount = unitsToNumber(item.total?.value, item.total?.decimals ?? item.token?.decimals ?? 18);
    if (amount <= 0) continue;
    const cleaned = untrustedSymbol(item.token?.symbol);
    const symbol = symbolImitates(cleaned, nativeSymbol) || symbolImitates(cleaned, "MATIC") ? `${cleaned} (unverified token)` : cleaned;
    if (!price) { out.unpricedRows.push({ txHash: item.transaction_hash, asset: symbol, amount }); continue; }
    if (outgoing) { out.spentTokensUsd += amount * price; out.spentTokenRows += 1; }
    else { out.receivedTokensUsd += amount * price; out.receivedTokenRows += 1; }
  }
  out.spentUsd = out.spentNativeUsd + out.spentTokensUsd + out.gasUsd;
  out.receivedUsd = out.receivedNativeUsd + out.receivedTokensUsd;
  out.netUsd = out.receivedUsd - out.spentUsd;
  out.gasNative = `${(Number(out.gasNativeWei) / 1e18).toFixed(6)} ${nativeSymbol}`;
  out.gasNativeWei = out.gasNativeWei.toString();
  out.basis = "USD at the market price of each transaction's hour (DefiLlama historical prices).";
  return out;
}

export function roundUsd(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
