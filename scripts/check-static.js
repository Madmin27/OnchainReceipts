const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'README.md',
  'SECURITY.md',
  'LICENSE',
  'apps/web/index.html',
  'apps/web/styles.css',
  'apps/web/app.js',
  'schema/receipt.schema.json',
  'schema/intent.schema.json',
  'examples/sample-receipt.json',
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
