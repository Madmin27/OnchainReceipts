# Pricing and Quotas

The launch goal is adoption and trust, not extracting fees from individual users.

## Individual users

Free at launch:

- 100 receipts per wallet per month
- Base mainnet only
- 90-day history window
- SVG/PNG download
- limited monthly summary

Abuse controls:

- wallet login required for dashboard
- IP burst limits
- duplicate wallet + chain + tx hash does not count again
- cached downloads do not count again
- anonymous lookup disabled or heavily limited

## Dapps

Low launch pricing designed to cover infrastructure and encourage integration.

```txt
Free
- 250 verified receipts / month
- OnchainReceipts watermark
- community support

Starter - $9 / month
- 5,000 verified receipts / month
- basic branding
- API key
- dashboard
- overage: $0.001 / receipt

Builder - $29 / month
- 25,000 verified receipts / month
- custom logo
- webhook
- CSV export
- overage: $0.0008 / receipt

Growth - $79 / month
- 100,000 verified receipts / month
- priority processing
- advanced analytics
- overage: $0.0005 / receipt
```

## Counting rules

Counted:

- first verified receipt for a new project + chain + tx hash
- branded receipt creation
- anchored receipt creation in a premium plan

Not counted:

- duplicate receipt downloads
- same project + chain + tx hash regeneration
- failed parse before verification
- user-generated receipts when initiated from the user app

## Accounting for dapps

Each project has a monthly ledger:

- included receipts
- used receipts
- overage
- failed verification count
- webhook delivery count
- estimated invoice total

Invoices should include CSV export with tx hashes and receipt ids.
