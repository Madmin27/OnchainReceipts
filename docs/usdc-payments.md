# Base USDC Payments

TxReceipts should accept Base USDC for dapp credit top-ups. This keeps the product aligned with the network it verifies and avoids building card billing before it is needed.

## Accepted asset

```txt
Network: Base mainnet
Token: USDC
Contract: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
Decimals: 6
```

Only native Circle USDC on Base should count. Bridged or lookalike assets must be ignored.

## Recommended launch model

Use a monitored treasury wallet plus project-specific payment intents.

1. A dapp creates a credit top-up request.
2. TxReceipts returns:
   - payment id
   - Base USDC token contract
   - treasury receiving wallet
   - exact USDC amount
   - expiry time
   - project id
   - payment reference
3. The dapp pays from its registered billing wallet.
4. TxReceipts watches Base for a USDC `Transfer` to the treasury wallet.
5. After confirmation, credits are added to the project ledger.

This avoids asking for custody permissions. The dapp only sends a normal USDC transfer.

## Institutional wallet model

For organizations, each project can register one or more billing wallets.

```txt
project_billing_wallets
- project_id
- wallet_address
- label
- status: pending | active | revoked
- verified_at
```

Credits are loaded only when all conditions match:

- transfer is on Base mainnet;
- token contract is native USDC;
- recipient is the TxReceipts treasury wallet;
- sender is an active billing wallet for that project;
- amount is at least the minimum top-up;
- transaction hash was not credited before.

## Credit conversion

Launch conversion can be simple and transparent:

```txt
1 USDC = 1,000 verified receipt credits
minimum top-up: 5 USDC
maximum automatic top-up: 10,000 USDC
```

This implies:

```txt
0.001 USDC per verified receipt
```

Plan subscriptions can remain as discounted bundles later:

- Starter: 9 USDC / month for 5,000 credits
- Builder: 29 USDC / month for 25,000 credits
- Growth: 79 USDC / month for 100,000 credits

During the first launch period, prefer prepaid credits over recurring subscriptions. It is easier to explain and safer to operate.

## Ledger entries

USDC payments should create two append-only ledgers.

```txt
payment_ledger
- id
- project_id
- chain_id
- token_address
- from_address
- to_address
- tx_hash
- amount_usdc
- status: detected | confirmed | rejected | credited
- rejection_reason
- created_at
- confirmed_at
```

```txt
credit_ledger
- id
- project_id
- source: usdc_topup | free_grant | manual_adjustment | receipt_usage
- payment_id
- receipt_id
- delta
- balance_after
- reason
- created_at
```

Never rely only on a mutable project balance. The current balance should be derived from the credit ledger or reconciled against it.

## Payment states

```txt
created
waiting_for_payment
detected
confirmed
credited
expired
rejected
```

Reject a payment if:

- wrong network;
- wrong token;
- wrong recipient;
- amount below minimum;
- sender wallet is not linked to the project;
- tx hash was already credited;
- transfer is from a known risky or sanctioned address.

## Confirmations

For Base, launch with a small confirmation delay:

```txt
required confirmations: 3
```

For high-value top-ups, require manual review or a higher confirmation threshold.

Automatic crediting should reject or hold transfers above 10,000 USDC for manual review.

## API surface

```txt
POST /v1/credits/topups
GET  /v1/credits/topups/:id
GET  /v1/projects/:id/credits
POST /v1/projects/:id/billing-wallets
```

`POST /v1/credits/topups` returns a payment intent that can be shown in the dapp dashboard.

## Why not direct wallet connect payment first?

Direct wallet connect payments are convenient, but the first production version should also support manual transfers from institutional wallets. Many teams pay from treasury wallets, multisigs, or ops wallets. Watching for USDC transfers from registered billing wallets gives them a clean accounting trail.

Wallet connect payment can be added as a convenience layer later.

## Operational notes

- Use one treasury wallet at launch, but design for per-project deposit addresses later.
- Show the treasury address clearly and warn users to send only Base USDC.
- Reconcile payments daily against Base logs.
- Export CSV for payments and credit usage.
- Keep a manual admin override for legitimate payments that require review.

## Validation test coverage

The repository includes a small dependency-free validator in `packages/billing/usdc-credits.js` and tests in `scripts/test-usdc-credits.js`.

Covered scenarios:

- valid Base USDC top-up from a registered billing wallet;
- wrong chain id;
- wrong token contract;
- wrong recipient;
- unregistered sender wallet;
- amount below the minimum top-up;
- amount above the automatic top-up limit;
- insufficient confirmations;
- invalid transaction hash;
- duplicate transaction hash;
- multiple simultaneous rejection reasons.

Run:

```sh
npm run test:billing
```
