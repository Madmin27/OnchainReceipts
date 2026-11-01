export const NETWORK_CAPABILITIES = {
  base: {
    chainId: 8453,
    network: "base",
    displayName: "Base",
    nativeGasToken: "ETH",
    preferredStablecoin: "USDC",
    explorerBaseUrl: "https://basescan.org",
    supportsMcp: true,
    supportsX402: true,
    supportsBuilderCodes: true,
    supportsPaymaster: true,
    supportsBaseAccount: true,
    accountingNotes: [
      "Gas on Base is paid in ETH.",
      "Document date must be the blockchain transaction timestamp.",
      "USDC is the preferred stablecoin on Base.",
      "TxReceipts stays read-only: it never asks to sign, send, swap or approve.",
    ],
  },
  ethereum: {
    chainId: 1,
    network: "ethereum",
    displayName: "Ethereum",
    nativeGasToken: "ETH",
    explorerBaseUrl: "https://etherscan.io",
    supportsMcp: true,
    supportsX402: false,
    supportsBuilderCodes: false,
    supportsPaymaster: false,
    supportsBaseAccount: false,
    accountingNotes: [
      "Document date must be the blockchain transaction timestamp.",
      "TxReceipts stays read-only.",
    ],
  },
  optimism: {
    chainId: 10,
    network: "optimism",
    displayName: "Optimism",
    nativeGasToken: "ETH",
    explorerBaseUrl: "https://optimistic.etherscan.io",
    supportsMcp: true,
    supportsX402: false,
    supportsBuilderCodes: false,
    supportsPaymaster: false,
    supportsBaseAccount: false,
    accountingNotes: [
      "Document date must be the blockchain transaction timestamp.",
      "TxReceipts stays read-only.",
    ],
  },
  arbitrum: {
    chainId: 42161,
    network: "arbitrum",
    displayName: "Arbitrum One",
    nativeGasToken: "ETH",
    explorerBaseUrl: "https://arbiscan.io",
    supportsMcp: true,
    supportsX402: false,
    supportsBuilderCodes: false,
    supportsPaymaster: false,
    supportsBaseAccount: false,
    accountingNotes: [
      "Document date must be the blockchain transaction timestamp.",
      "TxReceipts stays read-only.",
    ],
  },
  polygon: {
    chainId: 137,
    network: "polygon",
    displayName: "Polygon",
    nativeGasToken: "POL",
    preferredStablecoin: "USDC",
    explorerBaseUrl: "https://polygonscan.com",
    supportsMcp: true,
    supportsX402: false,
    supportsBuilderCodes: false,
    supportsPaymaster: false,
    supportsBaseAccount: false,
    accountingNotes: [
      "Document date must be the blockchain transaction timestamp.",
      "TxReceipts stays read-only.",
    ],
  },
};

export function networkCapabilitiesById(networkId) {
  return NETWORK_CAPABILITIES[String(networkId || "").toLowerCase()] || null;
}

export function networkCapabilitiesByChainId(chainId) {
  return Object.values(NETWORK_CAPABILITIES).find(item => Number(item.chainId) === Number(chainId)) || null;
}

export function networkCapabilitiesForReceipt({ network, chainId } = {}) {
  return networkCapabilitiesById(network) || networkCapabilitiesByChainId(chainId) || null;
}

export function networkCapabilitiesSummary(capabilities) {
  if (!capabilities) return null;
  return {
    chainId: capabilities.chainId,
    network: capabilities.network,
    displayName: capabilities.displayName,
    nativeGasToken: capabilities.nativeGasToken,
    preferredStablecoin: capabilities.preferredStablecoin || null,
    explorerBaseUrl: capabilities.explorerBaseUrl,
    supportsMcp: Boolean(capabilities.supportsMcp),
    supportsX402: Boolean(capabilities.supportsX402),
    supportsBuilderCodes: Boolean(capabilities.supportsBuilderCodes),
    supportsPaymaster: Boolean(capabilities.supportsPaymaster),
    supportsBaseAccount: Boolean(capabilities.supportsBaseAccount),
    accountingNotes: Array.isArray(capabilities.accountingNotes) ? capabilities.accountingNotes : [],
  };
}

export function mcpNetworkCapabilities(capabilities) {
  if (!capabilities) return null;
  return {
    baseMcpCompatible: Boolean(capabilities.supportsMcp && capabilities.network === "base"),
    x402Ready: Boolean(capabilities.supportsX402),
    builderCodeSupported: Boolean(capabilities.supportsBuilderCodes),
    paymasterOptional: Boolean(capabilities.supportsPaymaster),
  };
}