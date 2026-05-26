CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_wallets (
  project_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  verified_at TEXT,
  PRIMARY KEY (project_id, wallet_address),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS topups (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  amount_usdc TEXT NOT NULL,
  credit_amount INTEGER NOT NULL,
  billing_wallet TEXT,
  receiving_address TEXT NOT NULL,
  status TEXT NOT NULL,
  tx_hash TEXT UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  credited_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, chain_id, tx_hash),
  UNIQUE(project_id, idempotency_key),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source TEXT NOT NULL,
  payment_id TEXT,
  receipt_id TEXT,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS payment_ledger (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  chain_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  amount_usdc TEXT NOT NULL,
  status TEXT NOT NULL,
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT
);

CREATE TABLE IF NOT EXISTS watcher_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
