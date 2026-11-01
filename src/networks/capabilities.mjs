// Compatibility shim: the canonical module now lives inside the publishable
// MCP package so `npm pack` ships it. Keep importing from here in the repo.
export * from "../../packages/mcp-server/src/networks/capabilities.mjs";
