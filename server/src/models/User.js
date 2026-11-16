import mongoose from "mongoose";
import { decrypt, encrypt, lookupHash } from "../services/crypto.js";

const { Schema } = mongoose;

const documentSchema = new Schema(
  {
    key: { type: String, required: true }, // panCard, aadhaarFront, selfie, signature, cheque
    fileId: { type: Schema.Types.ObjectId, required: true }, // GridFS file in the "kyc" bucket
    filename: String,
    contentType: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    clientId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mobile: { type: String, required: true, unique: true }, // 10 digits, no +91

    passwordHash: { type: String, required: true },
    pinHash: { type: String, required: true },
    pinFailures: { type: Number, default: 0 },
    pinLockedUntil: Date,
    // Bumped on password change / "log out everywhere": older tokens stop working
    tokenVersion: { type: Number, default: 0 },
    twoFactor: { type: Boolean, default: false }, // OTP to mobile on every login

    kyc: {
      status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
      note: String, // reason shown to the user when rejected
      reviewedAt: Date,
    },
    blocked: { type: Boolean, default: false },

    // Wallet, in paise. onHold = money reserved for withdrawals that admin has not paid out yet.
    availablePaise: { type: Number, default: 0, min: 0 },
    onHoldPaise: { type: Number, default: 0, min: 0 },

    profile: {
      panEnc: String, // encrypted
      panHash: String, // keyed hash, for the "already registered" check
      panMasked: String, // ABCDE••••F
      dob: Date,
      gender: String,
      maritalStatus: String,
      fatherName: String,
      occupation: String,
      income: String,
      experience: String,
      pep: { type: Boolean, default: false },
      taxResident: Boolean,
    },
    address: {
      aadhaarLast4: String,
      line: String,
      city: String,
      pincode: String,
      state: String,
      lat: Number,
      lng: Number,
    },
    bank: {
      accountHolder: String,
      accountNumberEnc: String, // encrypted
      accountLast4: String,
      ifsc: String,
      bankName: String,
      branch: String,
      accountType: String,
      upi: String,
    },
    nominee: {
      name: String,
      relation: String,
      dob: Date,
      guardianName: String,
      guardianRelation: String,
    },
    documents: [documentSchema],
    consents: {
      riskAck: Boolean,
      dataConsent: Boolean,
      terms: Boolean,
      marketing: Boolean,
      at: Date,
    },

    lastLoginAt: Date,
    prevLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.index({ "profile.panHash": 1 }, { unique: true, sparse: true });

/* ---------- Sensitive fields ---------- */

// Spread into `profile` / `bank` when creating a user
export const panFields = (pan) => ({
  panEnc: encrypt(pan),
  panHash: lookupHash(pan),
  panMasked: `${pan.slice(0, 5)}••••${pan.slice(-1)}`,
});

export const accountFields = (accountNumber) => ({
  accountNumberEnc: encrypt(accountNumber),
  accountLast4: accountNumber.slice(-4),
});

export const panLookup = (pan) => ({ "profile.panHash": lookupHash(pan) });
export const readPan = (user) => decrypt(user.profile?.panEnc);
export const readAccountNumber = (user) => decrypt(user.bank?.accountNumberEnc);

export const User = mongoose.model("User", userSchema);
