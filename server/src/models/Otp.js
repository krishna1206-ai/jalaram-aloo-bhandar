import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    // register | login | reset-password | reset-pin
    purpose: { type: String, required: true, default: "register" },
    channel: { type: String, enum: ["mobile", "email"], required: true },
    target: { type: String, required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    // MongoDB deletes the document automatically once this time passes
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

otpSchema.index({ purpose: 1, channel: 1, target: 1 });

export const Otp = mongoose.model("Otp", otpSchema);
