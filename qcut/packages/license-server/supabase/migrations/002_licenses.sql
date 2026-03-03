-- Licenses table: one per user, tracks plan and Stripe subscription
CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'expired')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  max_devices INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_stripe_customer ON licenses(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_licenses_stripe_subscription ON licenses(stripe_subscription_id);

-- Device activations: links a license to specific machines
CREATE TABLE IF NOT EXISTS device_activations (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_name TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE device_activations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_device_activations_license ON device_activations(license_id);
