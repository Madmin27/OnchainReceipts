# Contributing

Thanks for helping build OnchainReceipts.

## Useful areas

- Base transaction parsing
- ERC-20 transfer classification
- fee detection
- receipt schema review
- SVG/PNG receipt rendering
- wallet login security
- dapp SDK ergonomics
- docs and examples

## Principles

- Keep the project Base-first until the core experience is strong.
- Prefer deterministic parsing over vague summaries.
- Keep receipt artifacts professional and accounting-friendly.
- Do not add code that asks for private keys, seed phrases, approvals, or spending permissions.
- Escape all untrusted text before rendering.

## Local prototype

Open `apps/web/index.html` directly in a browser. No build step is required for the current prototype.
