const discoveredWallets = new Map();

function rememberWallet(id, name, provider) {
  if (!provider || discoveredWallets.has(id)) return;
  discoveredWallets.set(id, { id, name, provider });
}

function discoverLegacyWallets() {
  const injected = window.ethereum;
  if (!injected) return;
  const providers = Array.isArray(injected.providers) ? injected.providers : [injected];
  providers.forEach((provider, index) => {
    if (provider.isMetaMask) rememberWallet("metamask", "MetaMask", provider);
    else if (provider.isCoinbaseWallet) rememberWallet("coinbase", "Coinbase Wallet", provider);
    else if (provider.isRabby) rememberWallet("rabby", "Rabby", provider);
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

window.OnchainReceiptsWallets = {
  list() {
    discoverLegacyWallets();
    return [...discoveredWallets.values()].map(({ id, name }) => ({ id, name }));
  },
  get(id) {
    discoverLegacyWallets();
    return discoveredWallets.get(id)?.provider || null;
  },
  firstProvider() {
    discoverLegacyWallets();
    return discoveredWallets.values().next().value?.provider || null;
  },
};
