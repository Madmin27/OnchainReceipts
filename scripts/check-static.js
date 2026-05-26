const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'README.md',
  'SECURITY.md',
  'LICENSE',
  'apps/web/index.html',
  'apps/web/styles.css',
  'apps/web/app.js',
  'apps/web/assets/txreceipts-demo.gif',
  'schema/receipt.schema.json',
  'schema/intent.schema.json',
  'examples/sample-receipt.json',
  'docs/usdc-payments.md',
  'docs/ai-assistant.md',
  'packages/billing/usdc-credits.js',
  'apps/api/src/billing.mjs',
  'apps/api/src/worker.mjs',
  'apps/api/schema.sql',
  'apps/api/wrangler.toml.example',
  'docs/backend-deployment.md',
  'scripts/test-usdc-credits.js',
  'scripts/test-api-billing.mjs',
];

for (const file of requiredFiles) {
  const fullPath = path.join(__dirname, '..', file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schema/receipt.schema.json'), 'utf8'));
JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schema/intent.schema.json'), 'utf8'));
JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'examples/sample-receipt.json'), 'utf8'));

console.log('Static project checks passed.');
