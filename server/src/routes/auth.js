import { Router } from "express";
import rateLimit from "express-rate-limit";
import { config } from "../config.js";
import { db, withTransaction } from "../db.js";
import { HttpError, badRequest, validator } from "../errors.js";
import { accountColumns, getUser, getUserById, insertRow, newClientId, panColumns, panHash, userFromRow } from "../records.js";
import { IFSC_RE, lookupIfsc } from "../services/bank.js";
import { checkDocs, kycUpload, storeDocs } from "../services/kyc.js";
import { checkTarget, normalizeTarget, sendOtp, verifyOtp } from "../services/otp.js";
import { checkSecret, hashSecret, passwordProblem } from "../services/security.js";
import { adminToken, loginChallenge, readToken, userToken, verifiedToken } from "../services/tokens.js";
import { sessionUser } from "../services/views.js";

const router = Router();

const limiter = (limit, minutes, message) =>
  rateLimit({
    windowMs: minutes * 60 * 1000,
    limit: config.isTest ? 10_000 : limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: message },
  });

const loginLimit = limiter(10, 15, "Too many login attempts. Please wait 15 minutes and try again.");
const otpLimit = limiter(10, 15, "Too many OTP requests. Please wait a few minutes.");
const registerLimit = limiter(5, 60, "Too many sign-ups from this network. Please try again later.");
const lookupLimit = limiter(60, 15, "Too many lookups. Please wait a few minutes.");

const yes = (v) => v === true || v === "true" || v === "on";
const str = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const devFlag = () => (config.otpDevMode ? { devMode: true } : {});

// Compare against a real hash even when the account doesn't exist, so timing doesn't reveal accounts
let dummyHash;
const DUMMY = async () => (dummyHash ??= await hashSecret("not-a-real-password"));

function ageOn(date) {
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const m = now.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < date.getDate())) age--;
  return age;
}

const parseDate = (v) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

// Finds a user by email or mobile number (with or without +91)
export function findByIdentifier(identifier) {
  const id = str(identifier, 100).toLowerCase();
  if (!id) return null;
  if (id.includes("@")) return getUser(db, "email = $1", [id]);
  const digits = id.replace(/\D/g, "");
  return getUser(db, "mobile = $1", [digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits]);
}

const maskTarget = (channel, t) =>
  channel === "email" ? t.replace(/^(.{2}).*(@.*)$/, "$1•••$2") : `+91 ${t.slice(0, 2)}•••••${t.slice(-3)}`;

/* ---------- OTP for registration ---------- */

router.post("/otp/send", otpLimit, async (req, res) => {
  const channel = req.body?.channel;
  const target = normalizeTarget(channel, req.body?.target);
  checkTarget(channel, target);
  const taken = await db.query(`SELECT 1 FROM users WHERE ${channel === "email" ? "email" : "mobile"} = $1`, [target]);
  if (taken.rowCount) throw new HttpError(409, `This ${channel === "email" ? "email" : "mobile number"} is already registered. Please log in.`);
  await sendOtp("register", channel, target);
  res.json({ sent: true, ...devFlag() });
});

router.post("/otp/verify", otpLimit, async (req, res) => {
  const channel = req.body?.channel;
  const target = normalizeTarget(channel, req.body?.target);
  checkTarget(channel, target);
  await verifyOtp("register", channel, target, req.body?.code);
  res.json({ verified: true, token: verifiedToken(channel, target) });
});

/* ---------- Bank lookup (used by "Verify bank account") ---------- */

router.get("/ifsc/:code", lookupLimit, async (req, res) => {
  const bank = await lookupIfsc(req.params.code);
  if (!bank) throw new HttpError(404, "No bank branch found for this IFSC code.");
  res.json({ bank });
});

/* ---------- Registration ---------- */

router.post("/register", registerLimit, kycUpload, async (req, res) => {
  const b = req.body || {};
  const files = req.files || {};
  if (str(b.website)) throw badRequest("Registration failed."); // spam-trap field was filled in

  const v = validator();
  const mobile = normalizeTarget("mobile", b.mobile);
  const email = normalizeTarget("email", b.email);
  const mobileProof = readToken(b.mobileToken, "verified");
  const emailProof = readToken(b.emailToken, "verified");
  v.check(mobileProof?.channel === "mobile" && mobileProof.target === mobile, "mobile", "Verify your mobile number with OTP.");
  v.check(emailProof?.channel === "email" && emailProof.target === email, "email", "Verify your email with OTP.");

  // Profile
  const fullName = str(b.fullName, 100);
  const pan = str(b.pan, 10).toUpperCase();
  const dob = parseDate(str(b.dob));
  v.check(fullName.length >= 2, "fullName", "Enter your full name as on PAN.");
  v.check(/^[A-Z]{5}\d{4}[A-Z]$/.test(pan), "pan", "Enter a valid PAN, like ABCDE1234F.");
  v.check(dob && ageOn(dob) >= 18 && ageOn(dob) < 120, "dob", "You must be at least 18 years old.");
  for (const [field, label] of [["gender", "gender"], ["maritalStatus", "marital status"], ["occupation", "occupation"], ["income", "annual income"], ["experience", "trading experience"]]) {
    v.check(str(b[field]), field, `Select your ${label}.`);
  }
  v.check(str(b.fatherName).length >= 2, "fatherName", "Enter your father's name.");
  v.check(yes(b.taxResident), "taxResident", "Confirm that you are a tax resident of India.");

  // Address
  v.check(/^\d{4}$/.test(str(b.aadhaarLast4)), "aadhaarLast4", "Enter the last 4 digits of your Aadhaar.");
  v.check(str(b.address, 300).length >= 5, "address", "Enter your full address.");
  v.check(str(b.city).length >= 2, "city", "Enter your city.");
  v.check(/^[1-9]\d{5}$/.test(str(b.pincode)), "pincode", "Enter a valid 6-digit pincode.");
  v.check(str(b.state), "state", "Select your state.");

  // Documents
  const docKeys = checkDocs(files, v);

  // Bank
  const accountNumber = str(b.accountNumber).replace(/\D/g, "");
  const ifsc = str(b.ifsc, 11).toUpperCase();
  const upi = str(b.upi, 60);
  v.check(str(b.accountHolder).length >= 2, "accountHolder", "Enter the account holder name.");
  v.check(/^\d{9,18}$/.test(accountNumber), "accountNumber", "Enter a valid bank account number (9–18 digits).");
  v.check(accountNumber === str(b.confirmAccountNumber).replace(/\D/g, ""), "confirmAccountNumber", "Account numbers do not match.");
  v.check(IFSC_RE.test(ifsc), "ifsc", "Enter a valid IFSC code, like SBIN0001234.");
  v.check(["Savings", "Current"].includes(str(b.accountType)), "accountType", "Select the account type.");
  v.check(!upi || /^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upi), "upi", "Enter a valid UPI ID, like name@bank.");

  // Nominee (optional, but complete if started)
  const nomineeName = str(b.nomineeName, 100);
  const nomineeDob = parseDate(str(b.nomineeDob));
  if (nomineeName) {
    v.check(str(b.nomineeRelation), "nomineeRelation", "Select the nominee's relationship.");
    v.check(nomineeDob && nomineeDob <= new Date(), "nomineeDob", "Enter the nominee's date of birth.");
    if (nomineeDob && ageOn(nomineeDob) < 18) {
      v.check(str(b.guardianName).length >= 2, "guardianName", "A guardian is needed for a nominee under 18.");
      v.check(str(b.guardianRelation), "guardianRelation", "Select the guardian's relation.");
    }
  }

  // Security
  const pwProblem = passwordProblem(b.password);
  v.check(!pwProblem, "password", pwProblem);
  v.check(b.password === b.confirmPassword, "confirmPassword", "Passwords do not match.");
  v.check(/^\d{6}$/.test(str(b.pin)), "pin", "Your transaction PIN must be 6 digits.");
  v.check(b.pin === b.confirmPin, "confirmPin", "PINs do not match.");
  v.check(yes(b.riskAck), "riskAck", "Please accept the risk statement.");
  v.check(yes(b.dataConsent), "dataConsent", "Please give consent to process your KYC data.");
  v.check(yes(b.terms), "terms", "Please accept the terms and conditions.");

  v.done();

  // The IFSC must exist. If the lookup service itself is down, don't block sign-up.
  let branchInfo = null;
  try {
    branchInfo = await lookupIfsc(ifsc);
    if (!branchInfo) throw badRequest("No bank branch found for this IFSC code.", { ifsc: "Not found." });
  } catch (err) {
    if (err.status === 400) throw err;
  }

  const dup = await db.query("SELECT 1 FROM users WHERE email = $1 OR mobile = $2 OR pan_hash = $3", [email, mobile, panHash(pan)]);
  if (dup.rowCount) throw new HttpError(409, "An account with this mobile, email or PAN already exists. Please log in.");

  const [passwordHash, pinHash] = await Promise.all([hashSecret(b.password), hashSecret(b.pin)]);
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  const hasPoint = b.lat !== undefined && b.lat !== "" && b.lng !== "" && Number.isFinite(lat) && Number.isFinite(lng);

  // The user and their documents are saved together: either both or neither
  const user = await withTransaction(async (tx) => {
    const row = await insertRow(tx, "users", {
      client_id: await newClientId(tx),
      name: fullName,
      email,
      mobile,
      password_hash: passwordHash,
      pin_hash: pinHash,
      ...panColumns(pan),
      dob: str(b.dob),
      gender: str(b.gender),
      marital_status: str(b.maritalStatus),
      father_name: str(b.fatherName, 100),
      occupation: str(b.occupation),
      income: str(b.income),
      experience: str(b.experience),
      pep: b.pep === "yes",
      tax_resident: true,
      aadhaar_last4: str(b.aadhaarLast4),
      address_line: str(b.address, 300),
      city: str(b.city, 80),
      pincode: str(b.pincode),
      state: str(b.state, 80),
      lat: hasPoint ? lat : undefined,
      lng: hasPoint ? lng : undefined,
      bank_holder: str(b.accountHolder, 100),
      ...accountColumns(accountNumber),
      ifsc,
      bank_name: branchInfo?.bank,
      bank_branch: branchInfo?.branch,
      account_type: str(b.accountType),
      upi: upi || undefined,
      nominee_name: nomineeName || undefined,
      nominee_relation: nomineeName ? str(b.nomineeRelation) : undefined,
      nominee_dob: nomineeName ? str(b.nomineeDob) : undefined,
      guardian_name: nomineeName ? str(b.guardianName, 100) || undefined : undefined,
      guardian_relation: nomineeName ? str(b.guardianRelation) || undefined : undefined,
      consent_risk: true,
      consent_data: true,
      consent_terms: true,
      consent_marketing: yes(b.marketing),
      consent_at: new Date(),
      last_login_at: new Date(),
    });
    await storeDocs(tx, row.id, files, docKeys);
    return userFromRow(row);
  });

  res.status(201).json({ token: userToken(user), user: sessionUser(user) });
});

/* ---------- Login (with optional two-step OTP) ---------- */

async function finishLogin(user, res) {
  await db.query("UPDATE users SET prev_login_at = last_login_at, last_login_at = now() WHERE id = $1", [user.id]);
  res.json({ token: userToken(user), user: sessionUser(user) });
}

router.post("/login", loginLimit, async (req, res) => {
  const password = String(req.body?.password ?? "");
  const identifier = req.body?.identifier ?? req.body?.email;
  if (!str(identifier) || !password) throw badRequest("Enter your mobile or email and password.");

  const user = await findByIdentifier(identifier);
  const ok = await checkSecret(password, user?.passwordHash || (await DUMMY()));
  // Same message whether the account exists or not, so accounts can't be discovered
  if (!user || !ok) throw new HttpError(401, "Wrong mobile/email or password.");
  if (user.blocked) throw new HttpError(403, "Your account is blocked. Please contact support.");

  if (user.twoFactor) {
    await sendOtp("login", "mobile", user.mobile);
    return res.json({ twoFactor: true, challenge: loginChallenge(user), sentTo: maskTarget("mobile", user.mobile), ...devFlag() });
  }
  await finishLogin(user, res);
});

// Body: { challenge, code }
router.post("/login/verify", loginLimit, async (req, res) => {
  const payload = readToken(req.body?.challenge, "login-challenge");
  if (!payload) throw new HttpError(401, "This login has expired. Please enter your password again.");
  const user = /^\d+$/.test(String(payload.sub)) ? await getUserById(db, Number(payload.sub)) : null;
  if (!user || (payload.v ?? 0) !== user.tokenVersion) throw new HttpError(401, "This login has expired. Please enter your password again.");
  if (user.blocked) throw new HttpError(403, "Your account is blocked. Please contact support.");
  await verifyOtp("login", "mobile", user.mobile, req.body?.code);
  await finishLogin(user, res);
});

/* ---------- Forgot password ---------- */

// Body: { identifier }. Always answers the same way, so it can't be used to find accounts.
router.post("/password/forgot", otpLimit, async (req, res) => {
  const user = await findByIdentifier(req.body?.identifier);
  if (user && !user.blocked) {
    await sendOtp("reset-password", "mobile", user.mobile).catch((err) => {
      if (err.status !== 429) throw err;
    });
  }
  res.json({ sent: true, message: "If an account exists, we have sent an OTP to its registered mobile number.", ...devFlag() });
});

// Body: { identifier, code, password }
router.post("/password/reset", otpLimit, async (req, res) => {
  const problem = passwordProblem(req.body?.password);
  if (problem) throw badRequest(problem, { password: problem });
  const user = await findByIdentifier(req.body?.identifier);
  if (!user) throw badRequest("This OTP has expired. Please request a new one.", { code: "Expired." });
  await verifyOtp("reset-password", "mobile", user.mobile, req.body?.code);
  // New password; token_version + 1 signs out every device
  await db.query("UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1", [
    user.id,
    await hashSecret(req.body.password),
  ]);
  res.json({ reset: true });
});

/* ---------- Admin login ---------- */

router.post("/admin/login", loginLimit, async (req, res) => {
  const username = str(req.body?.username, 60).toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!username || !password) throw badRequest("Enter your username and password.");
  const { rows } = await db.query("SELECT * FROM admins WHERE username = $1", [username]);
  const admin = rows[0];
  const ok = await checkSecret(password, admin?.password_hash || (await DUMMY()));
  if (!admin || !ok) throw new HttpError(401, "Wrong username or password.");
  await db.query("UPDATE admins SET last_login_at = now() WHERE id = $1", [admin.id]);
  res.json({ token: adminToken(admin), admin: { username: admin.username } });
});

export default router;
