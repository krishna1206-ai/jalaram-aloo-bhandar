import mongoose from "mongoose";

const { Schema } = mongoose;

// Every admin action that changes money, KYC, blocking or rates
const auditSchema = new Schema(
  {
    admin: { type: Schema.Types.ObjectId, ref: "Admin" },
    adminName: String,
    action: { type: String, required: true }, // e.g. "wallet.approve", "kyc.reject", "rate.update"
    target: String, // client ID, request ID, "potato/Ahmedabad"
    detail: Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model("AuditLog", auditSchema);

export const audit = (req, action, target, detail) =>
  AuditLog.create({ admin: req.admin?._id, adminName: req.admin?.username, action, target, detail, ip: req.ip }).catch((err) =>
    console.error("audit log failed", err)
  );
