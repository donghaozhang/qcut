-- Credit balances: one row per user, tracks plan + top-up credits
CREATE TABLE IF NOT EXISTS credit_balances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  plan_credits NUMERIC(12,3) NOT NULL DEFAULT 50,
  top_up_credits NUMERIC(12,3) NOT NULL DEFAULT 0,
  plan_credits_reset_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE credit_balances ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_credit_balances_user ON credit_balances(user_id);

-- Credit transactions: full audit log of all credit movements
CREATE TABLE IF NOT EXISTS credit_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('plan_grant', 'top_up', 'deduction', 'refund', 'expiry')),
  amount NUMERIC(12,3) NOT NULL,
  balance_after NUMERIC(12,3) NOT NULL,
  description TEXT,
  model_key TEXT,
  stripe_payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created ON credit_transactions(created_at DESC);
