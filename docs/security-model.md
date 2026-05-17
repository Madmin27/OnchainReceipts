# Security Model

## Threat model

OnchainReceipts is a read-mostly product, but it still touches sensitive user trust surfaces:

- wallet login signatures
- transaction interpretation
- dapp-submitted metadata
- downloadable receipts users may rely on for accounting
- developer API keys
- RPC provider credentials

## Non-goals

OnchainReceipts must not:

- custody assets
- request token approvals
- request spending permissions
- generate transactions on behalf of users
- ask for seed phrases or private keys
- claim tax, legal, or accounting finality without proper disclaimers

## User authentication

Wallet login should use a human-readable SIWE-style message:

- domain
- wallet address
- nonce
- issued at
- expiration
- statement that signing does not authorize transactions or spending

The message must never be blind or generic.

## Receipt verification

Dapp intent metadata is untrusted until checked.

Verification steps:

1. Fetch transaction and receipt from a trusted network RPC/indexer.
2. Confirm chain id 8453.
3. Confirm transaction success.
4. Parse logs for ERC-20 transfers and known event types.
5. Calculate effective gas fee.
6. Compare observed transfers with declared intent.
7. Mark receipt as `verified`, `partial`, `mismatch`, or `failed`.

## Abuse controls

User traffic:

- wallet-signature login
- wallet monthly quota
- IP daily quota
- anonymous lookup very limited
- suspicious traffic challenged with Turnstile or disabled
- same wallet + chain + tx hash duplicate does not count again

Dapp traffic:

- API keys
- project-level monthly quotas
- burst rate limits
- duplicate tx hash dedupe per project
- webhook retry limits
- abuse suspension

## Privacy

Receipts are based on public onchain data, but user dashboards still create privacy risk by grouping addresses, labels, and history.

Default stance:

- do not make user receipt boxes public
- do not publish wallet-linked analytics by default
- make share links explicit
- allow users to delete offchain labels and cached receipt artifacts

## Rendering safety

Receipt renderers must treat all untrusted text as inert text. Dapp-provided names, notes, URLs, and labels must never be inserted as raw HTML.

The browser demo renders receipts directly to canvas PNG output instead of interpreting receipt data as executable markup.
