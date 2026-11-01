export type NetworkCapabilities = {
  chainId: number;
  network: string;
  displayName: string;
  nativeGasToken: string;
  preferredStablecoin?: string;
  explorerBaseUrl: string;
  supportsMcp: boolean;
  supportsX402: boolean;
  supportsBuilderCodes: boolean;
  supportsPaymaster: boolean;
  supportsBaseAccount: boolean;
  accountingNotes: string[];
};

export const NETWORK_CAPABILITIES: Record<string, NetworkCapabilities> = {
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