import mongoose from "mongoose";

// Sequence numbers for readable IDs like JAB-2026-004901, TXN100301, OR55201, WR9101.
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.model("Counter", counterSchema);

async function next(name, session) {
  const c = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", session }
  );
  return c.seq;
}

export const newClientId = async (session) =>
  `JAB-${new Date().getFullYear()}-${String(4900 + (await next("client", session))).padStart(6, "0")}`;
export const newTxnId = async (session) => `TXN${100300 + (await next("txn", session))}`;
export const newOrderId = async (session) => `OR${55200 + (await next("order", session))}`;
export const newRequestId = async (session) => `WR${9100 + (await next("walletRequest", session))}`;
