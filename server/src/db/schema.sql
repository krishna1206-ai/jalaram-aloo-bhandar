-- Jalaram Aloo Bhandar database (PostgreSQL).
-- Applied automatically when the server starts; every statement is safe to run again.
-- Money is stored in whole paise (BIGINT) so sums never drift. Rates are rupees per bag.

CREATE SEQUENCE IF NOT EXISTS client_seq START 4901;
CREATE SEQUENCE IF NOT EXISTS txn_seq START 100301;
CREATE SEQUENCE IF NOT EXISTS order_seq START 55201;
CREATE SEQUENCE IF NOT EXISTS wallet_request_seq START 9101;

CREATE TABLE IF NOT EXISTS admins (
  id             SERIAL PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  token_version  INT NOT NULL DEFAULT 0,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id                BIGSERIAL PRIMARY KEY,
  client_id         TEXT NOT NULL UNIQUE,          -- JAB-2026-004901
  name              TEXT NOT NULL,
  email             TEXT NOT NULL UNIQUE,
  mobile            TEXT NOT NULL UNIQUE,          -- 10 digits, no +91

  password_hash     TEXT NOT NULL,
  pin_hash          TEXT NOT NULL,
  pin_failures      INT NOT NULL DEFAULT 0,
  pin_locked_until  TIMESTAMPTZ,
  token_version     INT NOT NULL DEFAULT 0,        -- bumped to sign out every device
  two_factor        BOOLEAN NOT NULL DEFAULT false,

  kyc_status        TEXT NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'verified', 'rejected')),
  kyc_note          TEXT,
  kyc_reviewed_at   TIMESTAMPTZ,
  blocked           BOOLEAN NOT NULL DEFAULT false,

  -- Wallet. on_hold = withdrawals waiting for an admin to pay out.
  available_paise   BIGINT NOT NULL DEFAULT 0 CHECK (available_paise >= 0),
  on_hold_paise     BIGINT NOT NULL DEFAULT 0 CHECK (on_hold_paise >= 0),

  -- Profile. PAN is encrypted (pan_enc); pan_hash finds duplicates without decrypting.
  pan_enc           TEXT,
  pan_hash          TEXT UNIQUE,
  pan_masked        TEXT,
  dob               DATE,
  gender            TEXT,
  marital_status    TEXT,
  father_name       TEXT,
  occupation        TEXT,
  income            TEXT,
  experience        TEXT,
  pep               BOOLEAN NOT NULL DEFAULT false,
  tax_resident      BOOLEAN,

  -- Address
  aadhaar_last4     TEXT,
  address_line      TEXT,
  city              TEXT,
  pincode           TEXT,
  state             TEXT,
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,

  -- Payout bank account. The account number is encrypted.
  bank_holder       TEXT,
  bank_account_enc  TEXT,
  bank_last4        TEXT,
  ifsc              TEXT,
  bank_name         TEXT,
  bank_branch       TEXT,
  account_type      TEXT,
  upi               TEXT,

  -- Nominee
  nominee_name      TEXT,
  nominee_relation  TEXT,
  nominee_dob       DATE,
  guardian_name     TEXT,
  guardian_relation TEXT,

  consent_risk      BOOLEAN,
  consent_data      BOOLEAN,
  consent_terms     BOOLEAN,
  consent_marketing BOOLEAN NOT NULL DEFAULT false,
  consent_at        TIMESTAMPTZ,

  last_login_at     TIMESTAMPTZ,
  prev_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- KYC files (PAN card photo, selfie, ...), max 2 MB each
CREATE TABLE IF NOT EXISTS kyc_documents (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_key       TEXT NOT NULL,                     -- panCard, aadhaarFront, selfie, signature, cheque
  filename      TEXT,
  content_type  TEXT NOT NULL,
  size          INT NOT NULL,
  data          BYTEA NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, doc_key)
);

CREATE TABLE IF NOT EXISTS otps (
  id          BIGSERIAL PRIMARY KEY,
  purpose     TEXT NOT NULL,                       -- register | login | reset-password | reset-pin
  channel     TEXT NOT NULL CHECK (channel IN ('mobile', 'email')),
  target      TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otps_lookup ON otps (purpose, channel, target);

-- Today's mandi rate per product and city (₹ per bag)
CREATE TABLE IF NOT EXISTS rates (
  id          SERIAL PRIMARY KEY,
  product     TEXT NOT NULL,
  city        TEXT NOT NULL,
  today       NUMERIC(12, 2) NOT NULL,
  yesterday   NUMERIC(12, 2) NOT NULL,
  low         NUMERIC(12, 2) NOT NULL,
  high        NUMERIC(12, 2) NOT NULL,
  arrivals    INT NOT NULL,                        -- bags that reached the mandi today
  day         DATE NOT NULL,                       -- the (IST) day `today` belongs to
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product, city)
);

-- One daily candle per rate, for the price chart
CREATE TABLE IF NOT EXISTS rate_history (
  rate_id  INT NOT NULL REFERENCES rates(id) ON DELETE CASCADE,
  day      DATE NOT NULL,
  o        NUMERIC(12, 2) NOT NULL,
  h        NUMERIC(12, 2) NOT NULL,
  l        NUMERIC(12, 2) NOT NULL,
  c        NUMERIC(12, 2) NOT NULL,
  v        INT NOT NULL,
  PRIMARY KEY (rate_id, day)
);

-- Deposit ("in") or withdrawal ("out") request that an admin approves
CREATE TABLE IF NOT EXISTS wallet_requests (
  id            BIGSERIAL PRIMARY KEY,
  req_id        TEXT NOT NULL UNIQUE,              -- WR9101
  user_id       BIGINT NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL CHECK (type IN ('in', 'out')),
  amount_paise  BIGINT NOT NULL CHECK (amount_paise > 0),
  method        TEXT NOT NULL,
  reference     TEXT,                              -- UTR or UPI ID given by the user
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_at    TIMESTAMPTZ,
  decided_by    INT REFERENCES admins(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_requests_user ON wallet_requests (user_id);
CREATE INDEX IF NOT EXISTS wallet_requests_status ON wallet_requests (status);

CREATE TABLE IF NOT EXISTS orders (
  id             BIGSERIAL PRIMARY KEY,
  order_id       TEXT NOT NULL UNIQUE,             -- OR55201
  user_id        BIGINT NOT NULL REFERENCES users(id),
  side           TEXT NOT NULL CHECK (side IN ('Buy', 'Sell')),
  product        TEXT NOT NULL,
  city           TEXT NOT NULL,
  bags           INT NOT NULL CHECK (bags > 0),
  rate_paise     BIGINT NOT NULL,                  -- per bag
  charges_paise  BIGINT NOT NULL,
  total_paise    BIGINT NOT NULL,                  -- buy: paid; sell: received
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_user ON orders (user_id);

-- The passbook. amount_paise is + for money in, − for money out.
CREATE TABLE IF NOT EXISTS transactions (
  id                 BIGSERIAL PRIMARY KEY,
  txn_id             TEXT NOT NULL UNIQUE,         -- TXN100301
  user_id            BIGINT NOT NULL REFERENCES users(id),
  type               TEXT NOT NULL CHECK (type IN ('Added money', 'Withdrawal', 'Bought', 'Sold', 'Charges')),
  descr              TEXT NOT NULL,
  amount_paise       BIGINT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'Completed' CHECK (status IN ('Completed', 'Pending', 'Rejected')),
  wallet_request_id  BIGINT REFERENCES wallet_requests(id),
  order_ref          BIGINT REFERENCES orders(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_user ON transactions (user_id, created_at DESC);

-- Bags each user holds in each city's godown
CREATE TABLE IF NOT EXISTS holdings (
  user_id         BIGINT NOT NULL REFERENCES users(id),
  product         TEXT NOT NULL,
  city            TEXT NOT NULL,
  bags            INT NOT NULL CHECK (bags >= 0),
  avg_cost_paise  BIGINT NOT NULL,                 -- average buy rate per bag
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product, city)
);

-- Online payments through Razorpay; credited to the wallet exactly once
CREATE TABLE IF NOT EXISTS payments (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id),
  amount_paise        BIGINT NOT NULL CHECK (amount_paise > 0),
  gateway_order_id    TEXT NOT NULL UNIQUE,
  gateway_payment_id  TEXT UNIQUE,
  method              TEXT,
  status              TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed')),
  paid_at             TIMESTAMPTZ,
  txn_ref             BIGINT REFERENCES transactions(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every admin action on money, KYC, users and rates
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  admin_id    INT REFERENCES admins(id),
  admin_name  TEXT,
  action      TEXT NOT NULL,
  target      TEXT,
  detail      JSONB,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_time ON audit_logs (created_at DESC);
