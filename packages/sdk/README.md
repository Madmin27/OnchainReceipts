# @onchainreceipts/sdk

Planned SDK for dapps that want to issue verified receipts after Base transactions.

## Draft API

```ts
import { OnchainReceipts } from '@onchainreceipts/sdk';

const receipts = new OnchainReceipts({
  apiKey: process.env.ONCHAIN_RECEIPTS_API_KEY,
});

const result = await receipts.create({
  version: '0.1',
  chainId: 8453,
  txHash: '0x...',
  user: '0x...',
  app: {
    name: 'ExampleSwap',
    url: 'https://example.com',
  },
  intent: {
    type: 'swap',
    description: 'Swap 25 USDC for ETH',
    expectedSent: [{ symbol: 'USDC', amount: '25.00' }],
    expectedReceived: [{ symbol: 'ETH', amount: '0.0068' }],
    appFee: { symbol: 'USDC', amount: '0.03' },
  },
});
```

## Expected response

```ts
{
  receiptId: 'or_...',
  status: 'verified',
  receiptUrl: 'https://...',
  svgUrl: 'https://...',
  pngUrl: 'https://...'
}
```

## Security notes

- Never send user secrets.
- Never ask for token approvals.
- Sign dapp requests server-side once project authentication is implemented.
- Treat receipt status `mismatch` as a support event, not a success.
