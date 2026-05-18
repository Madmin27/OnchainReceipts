import { TxReceipts } from "../packages/sdk/src";

const receipts = new TxReceipts({
  apiKey: process.env.TX_RECEIPTS_API_KEY || "",
  projectId: "example-swap",
});

async function main() {
  const topUp = await receipts.createCreditTopUp({
    amountUsdc: "10.00",
    billingWallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });

  console.log("Send Base USDC to:", topUp.receivingAddress);
  console.log("Token:", topUp.token.address);
  console.log("Credits:", topUp.creditAmount);
  console.log("Expires:", topUp.expiresAt);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
