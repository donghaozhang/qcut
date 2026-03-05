-- Payment hardening migration
-- 1) Enforce one license per user

CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_user_unique ON licenses(user_id);
