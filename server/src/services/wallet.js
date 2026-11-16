import { withTransaction } from "../db.js";
import { HttpError, badRequest } from "../errors.js";
import { MAX_DEPOSIT, MIN_WALLET_AMOUNT, toPaise, toRupees } from "../money.js";
import { Transaction, User, WalletRequest, newRequestId, newTxnId } from "../models/index.js";
import { assertCanTransact, verifyPin } from "./security.js";
import { bankLabel } from "./views.js";

const UPI_APPS = ["Google Pay", "PhonePe", "BHIM"];
const inr = (paise) => "₹" + toRupees(paise).toLocaleString("en-IN");

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < MIN_WALLET_AMOUNT) {
    throw badRequest(`Enter an amount of at least ₹${MIN_WALLET_AMOUNT}.`, { amount: "Too small." });
  }
  if (Math.round(amount * 100) !== amount * 100) throw badRequest("Amount can have at most 2 decimals.", { amount: "Invalid." });
  return toPaise(amount);
}

// Deposits wait until an admin confirms the money actually reached the collection account.
export async function requestDeposit(user, body) {
  assertCanTransact(user);
  const amountPaise = parseAmount(body.amount);
  if (amountPaise > toPaise(MAX_DEPOSIT)) throw badRequest("You can add up to ₹2,00,000 at a time.", { amount: "Too large." });

  let method;
  let reference;
  if (body.method === "UPI") {
    const upiId = String(body.upiId ?? "").trim();
    if (!/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upiId)) throw badRequest("Enter a valid UPI ID, like name@bank.", { upiId: "Invalid." });
    const app = UPI_APPS.includes(body.upiApp) ? body.upiApp : "UPI";
    method = `UPI · ${app} · ${upiId}`;
    reference = upiId;
  } else if (body.method === "Bank transfer") {
    const utr = String(body.utr ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6,30}$/.test(utr)) throw badRequest("Enter the UTR / reference number of your transfer.", { utr: "Invalid." });
    if (await WalletRequest.exists({ type: "in", reference: utr, status: { $ne: "rejected" } })) {
      throw badRequest("This UTR has already been submitted.", { utr: "Already used." });
    }
    method = `Bank transfer · UTR ${utr}`;
    reference = utr;
  } else if (body.method === "Debit card" || body.method === "Credit card") {
    throw new HttpError(422, "Card payments are not available yet. Please use UPI or bank transfer.");
  } else {
    throw badRequest("Choose how you want to pay.", { method: "Required." });
  }

  return withTransaction(async (session) => {
    const [req] = await WalletRequest.create(
      [{ reqId: await newRequestId(session), user: user._id, type: "in", amountPaise, method, reference }],
      { session }
    );
    const [txn] = await Transaction.create(
      [{
        txnId: await newTxnId(session),
        user: user._id,
        type: "Added money",
        desc: body.method === "UPI" ? `UPI · ${UPI_APPS.includes(body.upiApp) ? body.upiApp : "UPI"}` : "Bank transfer",
        amountPaise,
        status: "Pending",
        walletRequest: req._id,
      }],
      { session }
    );
    req.txn = txn._id;
    await req.save({ session });
    return { request: req, txn };
  });
}

// A withdrawal moves money from "available" to "on hold" until an admin pays it out.
export async function requestWithdrawal(user, body) {
  assertCanTransact(user);
  const amountPaise = parseAmount(body.amount);
  if (!user.bank?.accountLast4) throw badRequest("Add a bank account before withdrawing.");
  await verifyPin(user, body.pin);

  return withTransaction(async (session) => {
    const moved = await User.updateOne(
      { _id: user._id, availablePaise: { $gte: amountPaise } },
      { $inc: { availablePaise: -amountPaise, onHoldPaise: amountPaise } },
      { session }
    );
    if (!moved.modifiedCount) throw badRequest("You can't withdraw more than your available balance.", { amount: "Too large." });

    const [req] = await WalletRequest.create(
      [{ reqId: await newRequestId(session), user: user._id, type: "out", amountPaise, method: `Bank · ${bankLabel(user.bank)}` }],
      { session }
    );
    const [txn] = await Transaction.create(
      [{
        txnId: await newTxnId(session),
        user: user._id,
        type: "Withdrawal",
        desc: `To ${bankLabel(user.bank)}`,
        amountPaise: -amountPaise,
        status: "Pending",
        walletRequest: req._id,
      }],
      { session }
    );
    req.txn = txn._id;
    await req.save({ session });
    return { request: req, txn };
  });
}

export async function decideRequest(admin, reqId, approve) {
  return withTransaction(async (session) => {
    const req = await WalletRequest.findOne({ reqId }).session(session);
    if (!req) throw new HttpError(404, "Wallet request not found.");
    if (req.status !== "pending") throw new HttpError(409, `This request was already ${req.status}.`);

    const user = await User.findById(req.user).session(session);
    const amt = req.amountPaise;

    if (req.type === "in" && approve) {
      await User.updateOne({ _id: req.user }, { $inc: { availablePaise: amt } }, { session });
    } else if (req.type === "out") {
      // The money was put on hold when the user asked. Approve pays it out; reject gives it back.
      const inc = approve ? { onHoldPaise: -amt } : { onHoldPaise: -amt, availablePaise: amt };
      const done = await User.updateOne({ _id: req.user, onHoldPaise: { $gte: amt } }, { $inc: inc }, { session });
      if (!done.modifiedCount) throw new HttpError(409, `Can't settle: ${user?.name} has less than ${inr(amt)} on hold.`);
    }

    const status = approve ? "approved" : "rejected";
    const claimed = await WalletRequest.updateOne(
      { _id: req._id, status: "pending" },
      { status, decidedAt: new Date(), decidedBy: admin._id },
      { session }
    );
    if (!claimed.modifiedCount) throw new HttpError(409, "This request was just decided by someone else.");
    await Transaction.updateOne({ _id: req.txn }, { status: approve ? "Completed" : "Rejected" }, { session });

    return { request: { ...req.toObject(), status }, user };
  });
}
