import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { config } from "../config.js";
import { withTransaction } from "../db.js";
import { HttpError, badRequest, validator } from "../errors.js";
import { Admin, User, newClientId } from "../models/index.js";
import { deleteFiles, saveFile, sniffType } from "../services/files.js";
import { checkTarget, normalizeTarget, sendOtp, verifyOtp } from "../services/otp.js";
import { checkSecret, hashSecret, passwordProblem } from "../services/security.js";
import { adminToken, readToken, userToken } from "../services/tokens.js";
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

/* ---------- OTP (registration step 1) ---------- */

router.post("/otp/send", otpLimit, async (req, res) => {
  const channel = req.body?.channel;
  const target = normalizeTarget(channel, req.body?.target);
  checkTarget(channel, target);
  const taken = await User.exists(channel === "email" ? { email: target } : { mobile: target });
  if (taken) throw new HttpError(409, `This ${channel === "email" ? "email" : "mobile number"} is already registered. Please log in.`);
  await sendOtp(channel, target);
  res.json({ sent: true, ...(config.otpDevMode && { devMode: true }) });
});

router.post("/otp/verify", otpLimit, async (req, res) => {
  const channel = req.body?.channel;
  const target = normalizeTarget(channel, req.body?.target);
  checkTarget(channel, target);
  const token = await verifyOtp(channel, target, req.body?.code);
  res.json({ verified: true, token });
});

/* ---------- Registration ---------- */

const DOCS = {
  panCard: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  aadhaarFront: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  selfie: ["image/jpeg", "image/png", "image/webp"],
  signature: ["image/jpeg", "image/png", "image/webp"],
  cheque: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 5, fields: 60, fieldSize: 10 * 1024 },
}).fields(Object.keys(DOCS).map((name) => ({ name, maxCount: 1 })));

const yes = (v) => v === true || v === "true" || v === "on";
const str = (v, max = 200) => String(v ?? "").trim().slice(0, max);

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

router.post("/register", registerLimit, upload, async (req, res) => {
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

  // Documents: check the real file type from the bytes
  for (const [key, allowed] of Object.entries(DOCS)) {
    const file = files[key]?.[0];
    if (!v.check(file, key, "Upload this document.")) continue;
    const type = sniffType(file.buffer);
    if (v.check(type && allowed.includes(type), key, allowed.includes("application/pdf") ? "Upload a JPG, PNG, WebP or PDF file." : "Upload a JPG, PNG or WebP image.")) {
      file.detectedType = type;
    }
  }

  // Bank
  const accountNumber = str(b.accountNumber).replace(/\D/g, "");
  const ifsc = str(b.ifsc, 11).toUpperCase();
  const upi = str(b.upi, 60);
  v.check(str(b.accountHolder).length >= 2, "accountHolder", "Enter the account holder name.");
  v.check(/^\d{9,18}$/.test(accountNumber), "accountNumber", "Enter a valid bank account number (9–18 digits).");
  v.check(accountNumber === str(b.confirmAccountNumber).replace(/\D/g, ""), "confirmAccountNumber", "Account numbers do not match.");
  v.check(/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc), "ifsc", "Enter a valid IFSC code, like SBIN0001234.");
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

  if (await User.exists({ $or: [{ email }, { mobile }, { "profile.pan": pan }] })) {
    throw new HttpError(409, "An account with this mobile, email or PAN already exists. Please log in.");
  }

  const [passwordHash, pinHash] = await Promise.all([hashSecret(b.password), hashSecret(b.pin)]);

  const savedIds = [];
  try {
    const documents = [];
    for (const key of Object.keys(DOCS)) {
      const file = files[key][0];
      const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[file.detectedType];
      const fileId = await saveFile(file.buffer, { filename: `${key}.${ext}`, contentType: file.detectedType, metadata: { mobile, key } });
      savedIds.push(fileId);
      documents.push({ key, fileId, filename: file.originalname.slice(0, 120), contentType: file.detectedType, size: file.size });
    }

    const lat = Number(b.lat);
    const lng = Number(b.lng);
    const hasPoint = Number.isFinite(lat) && Number.isFinite(lng) && b.lat !== "" && b.lng !== "";

    const user = await withTransaction(async (session) => {
      const [created] = await User.create(
        [{
          clientId: await newClientId(session),
          name: fullName,
          email,
          mobile,
          passwordHash,
          pinHash,
          profile: {
            pan, dob, gender: str(b.gender), maritalStatus: str(b.maritalStatus), fatherName: str(b.fatherName, 100),
            occupation: str(b.occupation), income: str(b.income), experience: str(b.experience), pep: b.pep === "yes", taxResident: true,
          },
          address: {
            aadhaarLast4: str(b.aadhaarLast4), line: str(b.address, 300), city: str(b.city, 80), pincode: str(b.pincode), state: str(b.state, 80),
            ...(hasPoint && { lat, lng }),
          },
          bank: { accountHolder: str(b.accountHolder, 100), accountNumber, ifsc, accountType: str(b.accountType), upi },
          nominee: nomineeName
            ? { name: nomineeName, relation: str(b.nomineeRelation), dob: nomineeDob, guardianName: str(b.guardianName, 100), guardianRelation: str(b.guardianRelation) }
            : undefined,
          documents,
          consents: { riskAck: true, dataConsent: true, terms: true, marketing: yes(b.marketing), at: new Date() },
          lastLoginAt: new Date(),
        }],
        { session }
      );
      return created;
    });

    res.status(201).json({ token: userToken(user), user: sessionUser(user) });
  } catch (err) {
    await deleteFiles(savedIds);
    throw err;
  }
});

/* ---------- Login ---------- */

router.post("/login", loginLimit, async (req, res) => {
  const identifier = str(req.body?.identifier ?? req.body?.email, 100).toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!identifier || !password) throw badRequest("Enter your mobile or email and password.");

  const digits = identifier.replace(/\D/g, "");
  const query = identifier.includes("@") ? { email: identifier } : { mobile: digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits };
  const user = await User.findOne(query);
  // Same message whether the account exists or not, so accounts can't be discovered
  if (!user || !(await checkSecret(password, user.passwordHash))) throw new HttpError(401, "Wrong mobile/email or password.");
  if (user.blocked) throw new HttpError(403, "Your account is blocked. Please contact support.");

  user.prevLoginAt = user.lastLoginAt;
  user.lastLoginAt = new Date();
  await user.save();
  res.json({ token: userToken(user), user: sessionUser(user) });
});

router.post("/admin/login", loginLimit, async (req, res) => {
  const username = str(req.body?.username, 60).toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!username || !password) throw badRequest("Enter your username and password.");
  const admin = await Admin.findOne({ username });
  if (!admin || !(await checkSecret(password, admin.passwordHash))) throw new HttpError(401, "Wrong username or password.");
  admin.lastLoginAt = new Date();
  await admin.save();
  res.json({ token: adminToken(admin), admin: { username: admin.username } });
});

export default router;
