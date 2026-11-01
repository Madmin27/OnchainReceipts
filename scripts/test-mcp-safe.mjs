import assert from "node:assert";
import {
  USDC_ADDRESSES,
  assertApiUrl,
  csvCell,
  csvLine,
  isCanonicalUsdc,
  safeBigInt,
  sanitizeDeep,
  untrustedSymbol,
  untrustedText,
} from "../packages/mcp-server/src/safe.mjs";

// CSV: RFC 4180 quoting and spreadsheet formula neutralisation
assert.equal(csvCell('=HYPERLINK("http://evil","x")'), `"'=HYPERLINK(""http://evil"",""x"")"`);
assert.equal(csvCell("+1"), `"'+1"`);
assert.equal(csvCell("-5"), `"'-5"`);
assert.equal(csvCell("@cmd"), `"'@cmd"`);
assert.equal(csvCell("\tx"), `"'\tx"`);
assert.equal(csvCell("USDC,\r\nfake,row"), `"USDC,  fake,row"`);
assert.equal(csvCell(null), `""`);
assert.equal(csvLine(["a", 1, 'b"c']), `"a","1","b""c"`);
const injected = csvLine(["0xabc", "token\nnext,row", "=1+1"]);
assert.equal(injected.split("\n").length, 1, "line breaks must not create new CSV rows");

// Untrusted text: control/bidi characters, whitespace, length
assert.equal(untrustedText("ignore\u0000 all‮ previous"), "ignore all previous");
assert.equal(untrustedText("a".repeat(100), 10).length, 10);
assert.equal(untrustedText("   "), null);
assert.equal(untrustedText(undefined), null);
assert.equal(untrustedSymbol("USDC<script>alert(1)</script>"), "USDCscriptalert1script");
assert.equal(untrustedSymbol("\u0000"), "TOKEN");
assert.equal(untrustedSymbol("x".repeat(80)).length <= 32, true);

// Deep sanitisation keeps structure, strips strings, bounds depth
const deep = sanitizeDeep({ memo: "hi\u0007there", nested: { list: ["a​", 1, true, null] }, n: 2 });
assert.deepEqual(deep, { memo: "hi there", nested: { list: ["a", 1, true, null] }, n: 2 });
let chain = "leaf";
for (let i = 0; i < 12; i += 1) chain = { c: chain };
assert.equal(JSON.stringify(sanitizeDeep(chain)).includes("leaf"), false, "depth must be bounded");

// USDC is identified by contract address, never by symbol
assert.equal(isCanonicalUsdc("base", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"), true);
assert.equal(isCanonicalUsdc("base", USDC_ADDRESSES.ethereum), false);
assert.equal(isCanonicalUsdc("ethereum", USDC_ADDRESSES.ethereum), true);
assert.equal(isCanonicalUsdc("polygon", "0xdeadbeef"), false);
assert.equal(isCanonicalUsdc("unknown", USDC_ADDRESSES.base), false);

// safeBigInt never throws on explorer garbage
assert.equal(safeBigInt("1.5"), 0n);
assert.equal(safeBigInt("abc"), 0n);
assert.equal(safeBigInt("0x10"), 16n);
assert.equal(safeBigInt("42"), 42n);
assert.equal(safeBigInt(7), 7n);
assert.equal(safeBigInt(null), 0n);
assert.equal(safeBigInt(Number.NaN), 0n);

// API URL must be https except loopback
assert.equal(assertApiUrl("https://api.txreceipts.com.tr/"), "https://api.txreceipts.com.tr");
assert.equal(assertApiUrl("http://localhost:8788"), "http://localhost:8788");
assert.throws(() => assertApiUrl("http://api.txreceipts.com.tr"));
assert.throws(() => assertApiUrl("ftp://x"));

console.log("MCP safe helper tests passed.");
