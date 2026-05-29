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
      "Base aginda gas ETH ile odenir.",
      "Document Date blockchain transaction timestamp olmali.",
      "USDC Base icin tercih edilen stablecoin olarak ele alinabilir.",
      "TxReceipts read-only by default kalir; sign, send, swap, approval istemez.",
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
      "Document Date blockchain transaction timestamp olmali.",
      "TxReceipts read-only by default kalir.",
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
      "Document Date blockchain transaction timestamp olmali.",
      "TxReceipts read-only by default kalir.",
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
      "Document Date blockchain transaction timestamp olmali.",
      "TxReceipts read-only by default kalir.",
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
      "Document Date blockchain transaction timestamp olmali.",
      "TxReceipts read-only by default kalir.",
    ],
  },
};