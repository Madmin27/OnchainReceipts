// Spawns the stdio MCP server and checks the tool surface: names, annotations and write gating.
// Requires `npm ci` inside packages/mcp-server. No network calls are made.
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.join(here, "..", "packages", "mcp-server");
const serverPath = path.join(pkgDir, "src", "index.mjs");
const sdkRoot = path.join(pkgDir, "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm");
const { Client } = await import(pathToFileURL(path.join(sdkRoot, "client", "index.js")));
const { StdioClientTransport } = await import(pathToFileURL(path.join(sdkRoot, "client", "stdio.js")));

async function listTools(env) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...process.env, ...env },
    stderr: "pipe",
  });
  const client = new Client({ name: "txreceipts-test", version: "0.0.0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  await client.close();
  return tools;
}

const readOnlyTools = await listTools({ TX_RECEIPTS_ENABLE_WRITE: "", TX_RECEIPTS_API_KEY: "" });
const names = readOnlyTools.map(t => t.name).sort();
assert.deepEqual(names, [
  "explain_receipt",
  "export_accounting_csv",
  "find_review_required_transactions",
  "get_credit_balance",
  "get_monthly_summary",
  "get_pre_accounting_report",
  "get_public_receipt",
  "get_supported_networks",
  "get_transaction_summary",
  "get_wallet_activity",
  "get_wallet_ledger",
  "list_networks",
]);
for (const tool of readOnlyTools) {
  assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} must be annotated read-only`);
  assert.equal(typeof tool.annotations?.openWorldHint, "boolean", `${tool.name} must declare openWorldHint`);
}
const review = readOnlyTools.find(t => t.name === "find_review_required_transactions");
assert.ok(review.inputSchema.properties.minValueNative, "USD threshold replaced by native threshold");
assert.ok(!review.inputSchema.properties.minValueUsd);

const writeTools = await listTools({ TX_RECEIPTS_ENABLE_WRITE: "1", TX_RECEIPTS_API_KEY: "test-key" });
const create = writeTools.find(t => t.name === "create_receipt");
assert.ok(create, "create_receipt is registered only when TX_RECEIPTS_ENABLE_WRITE=1");
assert.equal(create.annotations?.readOnlyHint, false);
assert.equal(writeTools.length, readOnlyTools.length + 1);

// Insecure API URL must refuse to start
await assert.rejects(listTools({ TX_RECEIPTS_API_URL: "http://api.txreceipts.com.tr" }));

console.log("MCP server surface tests passed.");
