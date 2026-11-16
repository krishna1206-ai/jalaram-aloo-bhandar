import mongoose from "mongoose";

const { Schema } = mongoose;

// A deposit ("in") or withdrawal ("out") that an admin has to approve.
const walletRequestSchema = new Schema(
  {
    reqId: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["in", "out"], required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    method: { type: String, required: true }, // shown to admin, e.g. "UPI · name@okaxis"
    reference: String, // UTR / UPI ID the user gave
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    decidedAt: Date,
    decidedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    txn: { type: Schema.Types.ObjectId, ref: "Transaction" },
  },
  { timestamps: true }
);

// The user's passbook. amountPaise is signed: + money in, − money out.
const transactionSchema = new Schema(
  {
    txnId: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["Added money", "Withdrawal", "Bought", "Sold", "Charges"], required: true },
    desc: { type: String, required: true },
    amountPaise: { type: Number, required: true },
    status: { type: String, enum: ["Completed", "Pending", "Rejected"], default: "Completed" },
    walletRequest: { type: Schema.Types.ObjectId, ref: "WalletRequest" },
    order: { type: Schema.Types.ObjectId, ref: "Order" },
  },
  { timestamps: true }
);

transactionSchema.index({ user: 1, createdAt: -1 });

export const WalletRequest = mongoose.model("WalletRequest", walletRequestSchema);
export const Transaction = mongoose.model("Transaction", transactionSchema);
