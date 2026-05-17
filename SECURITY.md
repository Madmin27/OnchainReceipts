# Security Policy

TxReceipts handles public blockchain data, user wallet addresses, optional wallet login signatures, and dapp-submitted receipt metadata. It must never request or store seed phrases, private keys, token approvals, or spending permissions.

## Reporting vulnerabilities

Please report security issues privately by opening a GitHub security advisory if available, or by contacting the maintainers directly before publishing details.

## Core rules

- Never ask users for private keys or seed phrases.
- Never request token approvals for receipt generation.
- Wallet signatures must be human-readable login messages only.
- Treat all dapp-submitted intent metadata as untrusted until verified against onchain data.
- Do not render untrusted HTML in receipts.
- Do not expose RPC provider secrets to the browser.
- Cache public chain data carefully and invalidate on reorg-sensitive paths.
- Rate-limit anonymous, wallet, IP, and API-key traffic separately.

## Current status

This repository is in early prototype state. Do not treat it as production infrastructure yet.
