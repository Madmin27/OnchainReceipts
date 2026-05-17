# @txreceipts/engine

Planned transaction parser and receipt verification engine.

The engine will accept:

- Base chain id
- transaction hash
- optional dapp intent metadata

It will return:

- normalized receipt JSON
- verification checks
- fee breakdown
- transfer summary
- category inference
- renderer-ready data

## Planned pipeline

```txt
tx hash
  -> fetch transaction
  -> fetch transaction receipt
  -> parse logs
  -> classify transfers
  -> calculate gas
  -> compare dapp intent
  -> emit receipt JSON
```

## Design constraints

- Base first.
- Deterministic parsing before AI summaries.
- No private keys, no transaction creation.
- All dapp metadata treated as untrusted.
- Duplicate tx analysis should be cached.
