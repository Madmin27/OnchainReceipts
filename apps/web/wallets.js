const discoveredWallets = new Map();

function rememberWallet(id, name, provider, family = "evm") {
  if (!provider || discoveredWallets.has(id)) return;
  discoveredWallets.set(id, { id, name, provider, family });
  window.dispatchEvent(new CustomEvent("txreceipts:walletsChanged"));
}

function discoverLegacyWallets() {
  if (window.phantom?.solana) rememberWallet("phantom-solana", "Phantom Solana", window.phantom.solana, "solana");
  else if (window.solana?.isPhantom) rememberWallet("phantom-solana", "Phantom Solana", window.solana, "solana");
  if (window.solflare?.isSolflare) rememberWallet("solflare", "Solflare", window.solflare, "solana");
  if (window.backpack?.solana) rememberWallet("backpack-solana", "Backpack Solana", window.backpack.solana, "solana");
  if (window.glowSolana) rememberWallet("glow-solana", "Glow", window.glowSolana, "solana");
  if (window.phantom?.ethereum) rememberWallet("phantom-evm", "Phantom EVM", window.phantom.ethereum, "evm");

  const injected = window.ethereum;
  if (!injected) return;
  const providers = Array.isArray(injected.providers) ? injected.providers : [injected];
  providers.forEach((provider, index) => {
    if (provider.isMetaMask) rememberWallet("metamask", "MetaMask", provider);
    else if (provider.isCoinbaseWallet) rememberWallet("coinbase", "Coinbase Wallet", provider);
    else if (provider.isRabby) rememberWallet("rabby", "Rabby", provider);
    else if (provider.isTrust) rememberWallet("trust", "Trust Wallet", provider);
    else if (provider.isFrame) rememberWallet("frame", "Frame", provider);
    else if (provider.isBraveWallet) rememberWallet("brave", "Brave Wallet", provider);
    else if (provider.isOKExWallet || provider.isOkxWallet) rememberWallet("okx", "OKX Wallet", provider);
    else rememberWallet(`injected-${index}`, index === 0 ? "Browser wallet" : `Injected wallet ${index + 1}`, provider);
  });
}

window.addEventListener("eip6963:announceProvider", event => {
  const detail = event.detail;
  if (!detail?.provider || !detail?.info) return;
  rememberWallet(detail.info.uuid, detail.info.name || "Browser wallet", detail.provider);
});

window.dispatchEvent(new Event("eip6963:requestProvider"));
discoverLegacyWallets();
setTimeout(discoverLegacyWallets, 250);

window.TxReceiptsWallets = {
  list() {
    discoverLegacyWallets();
    return [...discoveredWallets.values()].map(({ id, name, family }) => ({ id, name, family }));
  },
  getInfo(id) {
    discoverLegacyWallets();
    const wallet = discoveredWallets.get(id);
    return wallet ? { id: wallet.id, name: wallet.name, family: wallet.family } : null;
  },
  get(id) {
    discoverLegacyWallets();
    return discoveredWallets.get(id)?.provider || null;
  },
  firstProvider() {
    discoverLegacyWallets();
    return discoveredWallets.values().next().value?.provider || null;
  },
  firstByFamily(family) {
    discoverLegacyWallets();
    return [...discoveredWallets.values()].find(wallet => wallet.family === family)?.provider || null;
  },
  firstInfoByFamily(family) {
    discoverLegacyWallets();
    const wallet = [...discoveredWallets.values()].find(item => item.family === family);
    return wallet ? { id: wallet.id, name: wallet.name, family: wallet.family } : null;
  },
};
