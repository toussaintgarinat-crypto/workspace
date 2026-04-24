ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash";
ALTER TABLE "users" DROP COLUMN IF EXISTS "totp_secret";
ALTER TABLE "users" DROP COLUMN IF EXISTS "totp_enabled";
