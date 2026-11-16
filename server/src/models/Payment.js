import mongoose from "mongoose";

const { Schema } = mongoose;

// An online payment through Razorpay. The wallet is credited exactly once, when status becomes "paid".
const paymentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amountPaise: { type: Number, required: true, min: 1 },
    gatewayOrderId: { type: String, required: true, unique: true }, // order_...
    gatewayPaymentId: { type: String, sparse: true, unique: true }, // pay_...
    method: String, // upi, card, netbanking... as reported by Razorpay
    status: { type: String, enum: ["created", "paid", "failed"], default: "created", index: true },
    paidAt: Date,
    txn: { type: Schema.Types.ObjectId, ref: "Transaction" },
  },
  { timestamps: true }
);

export const Payment = mongoose.model("Payment", paymentSchema);
