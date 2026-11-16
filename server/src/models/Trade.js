import mongoose from "mongoose";

const { Schema } = mongoose;

const orderSchema = new Schema(
  {
    orderId: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    side: { type: String, enum: ["Buy", "Sell"], required: true },
    product: { type: String, required: true },
    city: { type: String, required: true },
    bags: { type: Number, required: true, min: 1 },
    ratePaise: { type: Number, required: true }, // per bag
    chargesPaise: { type: Number, required: true },
    totalPaise: { type: Number, required: true }, // buy: paid from wallet; sell: paid into wallet
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: -1 });

// Bags a user holds in one city's godown. avgCostPaise is the average buy rate per bag.
const holdingSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    product: { type: String, required: true },
    city: { type: String, required: true },
    bags: { type: Number, required: true, min: 0 },
    avgCostPaise: { type: Number, required: true },
  },
  { timestamps: true }
);

holdingSchema.index({ user: 1, product: 1, city: 1 }, { unique: true });

export const Order = mongoose.model("Order", orderSchema);
export const Holding = mongoose.model("Holding", holdingSchema);
