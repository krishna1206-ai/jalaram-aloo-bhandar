import mongoose from "mongoose";

const { Schema } = mongoose;

const documentSchema = new Schema(
  {
    key: { type: String, required: true }, // panCard, aadhaarFront, selfie, signature, cheque
    fileId: { type: Schema.Types.ObjectId, required: true }, // GridFS file in the "kyc" bucket
    filename: String,
    contentType: String,
    size: Number,
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

    kyc: {
      status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
      reviewedAt: Date,
    },
    blocked: { type: Boolean, default: false },

    // Wallet, in paise. onHold = money reserved for withdrawals that admin has not paid out yet.
    availablePaise: { type: Number, default: 0, min: 0 },
    onHoldPaise: { type: Number, default: 0, min: 0 },

    profile: {
      pan: String,
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
      accountNumber: String,
      ifsc: String,
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

export const User = mongoose.model("User", userSchema);
