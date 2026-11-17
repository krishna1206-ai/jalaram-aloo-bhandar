import { withTransaction } from "../db.js";
import { HttpError, badRequest } from "../errors.js";
import { MAX_DEPOSIT, MIN_WALLET_AMOUNT, toPaise, toRupees } from "../money.js";
import { getUserById, insertRow, newRequestId, newTxnId } from "../records.js";
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
    method = `Bank transfer · UTR ${utr}`;
    reference = utr;
  } else if (body.method === "Debit card" || body.method === "Credit card") {
    throw new HttpError(422, "Card payments are not available yet. Please use UPI or bank transfer.");
  } else {
    throw badRequest("Choose how you want to pay.", { method: "Required." });
  }

  return withTransaction(async (tx) => {
    if (body.method === "Bank transfer") {
      const dup = await tx.query("SELECT 1 FROM wallet_requests WHERE type = 'in' AND reference = $1 AND status <> 'rejected'", [reference]);
      if (dup.rowCount) throw badRequest("This UTR has already been submitted.", { utr: "Already used." });
    }
    const req = await insertRow(tx, "wallet_requests", {
      req_id: await newRequestId(tx), user_id: user.id, type: "in", amount_paise: amountPaise, method, reference,
    });
    const txn = await insertRow(tx, "transactions", {
      txn_id: await newTxnId(tx),
      user_id: user.id,
      type: "Added money",
      descr: body.method === "UPI" ? `UPI · ${UPI_APPS.includes(body.upiApp) ? body.upiApp : "UPI"}` : "Bank transfer",
      amount_paise: amountPaise,
      status: "Pending",
      wallet_request_id: req.id,
    });
    return { request: req, txn };
  });
}

// A withdrawal moves money from "available" to "on hold" until an admin pays it out.
export async function requestWithdrawal(user, body) {
  assertCanTransact(user);
  const amountPaise = parseAmount(body.amount);
  if (!user.bank?.accountLast4) throw badRequest("Add a bank account before withdrawing.");
  await verifyPin(user, body.pin);

  return withTransaction(async (tx) => {
    const moved = await tx.query(
      `UPDATE users SET available_paise = available_paise - $2, on_hold_paise = on_hold_paise + $2
       WHERE id = $1 AND available_paise >= $2`,
      [user.id, amountPaise]
    );
    if (!moved.rowCount) throw badRequest("You can't withdraw more than your available balance.", { amount: "Too large." });

    const req = await insertRow(tx, "wallet_requests", {
      req_id: await newRequestId(tx), user_id: user.id, type: "out", amount_paise: amountPaise, method: `Bank · ${bankLabel(user.bank)}`,
    });
    const txn = await insertRow(tx, "transactions", {
      txn_id: await newTxnId(tx),
      user_id: user.id,
      type: "Withdrawal",
      descr: `To ${bankLabel(user.bank)}`,
      amount_paise: -amountPaise,
      status: "Pending",
      wallet_request_id: req.id,
    });
    return { request: req, txn };
  });
}

export async function decideRequest(admin, reqId, approve) {
  return withTransaction(async (tx) => {
    // Claim the request first: only one admin can move it out of "pending"
    const status = approve ? "approved" : "rejected";
    const { rows } = await tx.query(
      `UPDATE wallet_requests SET status = $2, decided_at = now(), decided_by = $3
       WHERE req_id = $1 AND status = 'pending' RETURNING *`,
      [reqId, status, admin.id]
    );
    const req = rows[0];
    if (!req) {
      const exists = await tx.query("SELECT status FROM wallet_requests WHERE req_id = $1", [reqId]);
      if (!exists.rowCount) throw new HttpError(404, "Wallet request not found.");
      throw new HttpError(409, `This request was already ${exists.rows[0].status}.`);
    }

    const amt = req.amount_paise;
    if (req.type === "in" && approve) {
      await tx.query("UPDATE users SET available_paise = available_paise + $2 WHERE id = $1", [req.user_id, amt]);
    } else if (req.type === "out") {
      // The money was put on hold when the user asked. Approve pays it out; reject gives it back.
      const done = await tx.query(
        approve
          ? "UPDATE users SET on_hold_paise = on_hold_paise - $2 WHERE id = $1 AND on_hold_paise >= $2"
          : "UPDATE users SET on_hold_paise = on_hold_paise - $2, available_paise = available_paise + $2 WHERE id = $1 AND on_hold_paise >= $2",
        [req.user_id, amt]
      );
      if (!done.rowCount) throw new HttpError(409, `Can't settle: less than ${inr(amt)} is on hold for this user.`);
    }
    await tx.query("UPDATE transactions SET status = $2 WHERE wallet_request_id = $1", [req.id, approve ? "Completed" : "Rejected"]);

    const user = await getUserById(tx, req.user_id);
    return { request: req, user };
  });
}
