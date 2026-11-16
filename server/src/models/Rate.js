import mongoose from "mongoose";

const { Schema } = mongoose;

// One daily candle, prices in ₹ per bag. t = start of the day in IST.
const candleSchema = new Schema(
  { t: Date, o: Number, h: Number, l: Number, c: Number, v: Number },
  { _id: false }
);

// Current mandi rate for one product in one city, plus its daily price history.
const rateSchema = new Schema(
  {
    product: { type: String, required: true },
    city: { type: String, required: true },
    today: { type: Number, required: true }, // ₹ per bag
    yesterday: { type: Number, required: true },
    low: { type: Number, required: true },
    high: { type: Number, required: true },
    arrivals: { type: Number, required: true }, // bags arrived at the mandi today
    day: { type: String, required: true }, // IST date "YYYY-MM-DD" that `today` belongs to
    history: { type: [candleSchema], default: [] }, // oldest first; always project it explicitly
  },
  { timestamps: true }
);

rateSchema.index({ product: 1, city: 1 }, { unique: true });

export const Rate = mongoose.model("Rate", rateSchema);
