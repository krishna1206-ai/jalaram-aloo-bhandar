// Helpers between PostgreSQL rows and the objects the services use.
import { decrypt, encrypt, lookupHash } from "./services/crypto.js";

/* ---------- Generic SQL helpers ---------- */

// INSERT one row from a { column: value } object and return it
export async function insertRow(db, table, values) {
  const cols = Object.keys(values).filter((k) => values[k] !== undefined);
  const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`;
  const { rows } = await db.query(sql, cols.map((k) => values[k]));
  return rows[0];
}

// UPDATE ... SET from a { column: value } object. `where` uses $1, $2... after the SET values.
export async function updateRow(db, table, values, where, whereParams = []) {
  const cols = Object.keys(values).filter((k) => values[k] !== undefined);
  const n = whereParams.length;
  const set = cols.map((k, i) => `${k} = $${n + i + 1}`).join(", ");
  const sql = `UPDATE ${table} SET ${set} WHERE ${where} RETURNING *`;
  const { rows } = await db.query(sql, [...whereParams, ...cols.map((k) => values[k])]);
  return rows[0] || null;
}

/* ---------- Readable IDs from PostgreSQL sequences ---------- */

const next = async (db, seq) => (await db.query(`SELECT nextval('${seq}') AS n`)).rows[0].n;

export const newClientId = async (db) => `JAB-${new Date().getFullYear()}-${String(await next(db, "client_seq")).padStart(6, "0")}`;
export const newTxnId = async (db) => `TXN${await next(db, "txn_seq")}`;
export const newOrderId = async (db) => `OR${await next(db, "order_seq")}`;
export const newRequestId = async (db) => `WR${await next(db, "wallet_request_seq")}`;

/* ---------- Sensitive fields ---------- */

export const panColumns = (pan) => ({
  pan_enc: encrypt(pan),
  pan_hash: lookupHash(pan),
  pan_masked: `${pan.slice(0, 5)}••••${pan.slice(-1)}`,
});

export const accountColumns = (accountNumber) => ({
  bank_account_enc: encrypt(accountNumber),
  bank_last4: accountNumber.slice(-4),
});

export const panHash = (pan) => lookupHash(pan);
export const readPan = (user) => decrypt(user.profile?.panEnc);
export const readAccountNumber = (user) => decrypt(user.bank?.accountNumberEnc);

/* ---------- Users ---------- */

// A users row as a nested object (the shape the services and views use)
export function userFromRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    clientId: r.client_id,
    name: r.name,
    email: r.email,
    mobile: r.mobile,
    passwordHash: r.password_hash,
    pinHash: r.pin_hash,
    pinFailures: r.pin_failures,
    pinLockedUntil: r.pin_locked_until,
    tokenVersion: r.token_version,
    twoFactor: r.two_factor,
    kyc: { status: r.kyc_status, note: r.kyc_note || "", reviewedAt: r.kyc_reviewed_at },
    blocked: r.blocked,
    availablePaise: r.available_paise,
    onHoldPaise: r.on_hold_paise,
    profile: {
      panEnc: r.pan_enc,
      panMasked: r.pan_masked,
      dob: r.dob,
      gender: r.gender,
      maritalStatus: r.marital_status,
      fatherName: r.father_name,
      occupation: r.occupation,
      income: r.income,
      experience: r.experience,
      pep: r.pep,
      taxResident: r.tax_resident,
    },
    address: {
      aadhaarLast4: r.aadhaar_last4,
      line: r.address_line,
      city: r.city,
      pincode: r.pincode,
      state: r.state,
      lat: r.lat,
      lng: r.lng,
    },
    bank: {
      accountHolder: r.bank_holder,
      accountNumberEnc: r.bank_account_enc,
      accountLast4: r.bank_last4,
      ifsc: r.ifsc,
      bankName: r.bank_name,
      branch: r.bank_branch,
      accountType: r.account_type,
      upi: r.upi,
    },
    nominee: {
      name: r.nominee_name,
      relation: r.nominee_relation,
      dob: r.nominee_dob,
      guardianName: r.guardian_name,
      guardianRelation: r.guardian_relation,
    },
    consents: {
      riskAck: r.consent_risk,
      dataConsent: r.consent_data,
      terms: r.consent_terms,
      marketing: r.consent_marketing,
      at: r.consent_at,
    },
    lastLoginAt: r.last_login_at,
    prevLoginAt: r.prev_login_at,
    createdAt: r.created_at,
  };
}

export async function getUser(db, where, params) {
  const { rows } = await db.query(`SELECT * FROM users WHERE ${where} LIMIT 1`, params);
  return userFromRow(rows[0]);
}

export const getUserById = (db, id) => getUser(db, "id = $1", [id]);

// Which KYC documents a user has uploaded (metadata only, not the file bytes)
export async function documentsOf(db, userId) {
  const { rows } = await db.query(
    "SELECT doc_key, filename, content_type, size, uploaded_at FROM kyc_documents WHERE user_id = $1 ORDER BY doc_key",
    [userId]
  );
  return rows.map((d) => ({ key: d.doc_key, filename: d.filename, contentType: d.content_type, size: d.size, uploadedAt: d.uploaded_at }));
}
