// Online deposits through Razorpay (UPI, cards, net banking).
// Flow: create order → Razorpay Checkout in the browser → verify signature (or webhook) → credit wallet once.
import crypto from "node:crypto";
import { config } from "../config.js";
import { db, withTransaction } from "../db.js";
import { HttpError, badRequest } from "../errors.js";
import { MAX_DEPOSIT, MIN_WALLET_AMOUNT, toPaise, toRupees } from "../money.js";
import { getUserById, insertRow, newTxnId } from "../records.js";
import { notifyUser } from "./notify.js";
import { assertCanTransact } from "./security.js";

const METHOD_LABEL = { upi: "UPI", card: "Card", netbanking: "Net banking", wallet: "Wallet", emi: "EMI" };

const hmac = (secret, text) => crypto.createHmac("sha256", secret).update(text).digest("hex");
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function razorpay(path, { method = "GET", body } = {}) {
  const { keyId, keySecret, apiBase } = config.razorpay;
  const res = await fetch(apiBase + path, {
    method,
    headers: {
      Authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Razorpay error", res.status, data?.error);
    throw new HttpError(502, "The payment service is not responding. Please try again.");
  }
  return data;
}

function requireEnabled() {
  if (!config.razorpay.enabled) throw new HttpError(422, "Online payments are not available yet. Please use UPI or bank transfer.");
}

export async function createPaymentOrder(user, amountRupees) {
  requireEnabled();
  assertCanTransact(user);
  const amount = Number(amountRupees);
  if (!Number.isFinite(amount) || amount < MIN_WALLET_AMOUNT) throw badRequest(`Enter an amount of at least ₹${MIN_WALLET_AMOUNT}.`, { amount: "Too small." });
  if (amount > MAX_DEPOSIT) throw badRequest("You can add up to ₹2,00,000 at a time.", { amount: "Too large." });
  const amountPaise = toPaise(amount);

  const order = await razorpay("/orders", {
    method: "POST",
    body: { amount: amountPaise, currency: "INR", receipt: `${user.clientId}-${Date.now()}`.slice(0, 40), notes: { clientId: user.clientId } },
  });
  await insertRow(db, "payments", { user_id: user.id, amount_paise: amountPaise, gateway_order_id: order.id });
  return {
    keyId: config.razorpay.keyId,
    orderId: order.id,
    amount: amountPaise, // Checkout wants paise
    currency: "INR",
    name: config.appName,
    prefill: { name: user.name, email: user.email, contact: `+91${user.mobile}` },
  };
}

// Marks the payment paid and credits the wallet. Safe to call many times: only the first call credits.
async function creditPayment(gatewayOrderId, gatewayPaymentId, method, amountPaise) {
  const result = await withTransaction(async (tx) => {
    const { rows } = await tx.query("SELECT * FROM payments WHERE gateway_order_id = $1 FOR UPDATE", [gatewayOrderId]);
    const payment = rows[0];
    if (!payment) throw new HttpError(404, "Payment not found.");
    if (payment.status === "paid") return { payment, credited: false };
    if (amountPaise !== undefined && Number(amountPaise) !== payment.amount_paise) throw new HttpError(409, "Paid amount does not match the order.");

    const txn = await insertRow(tx, "transactions", {
      txn_id: await newTxnId(tx),
      user_id: payment.user_id,
      type: "Added money",
      descr: `Razorpay · ${METHOD_LABEL[method] || "Online"}`,
      amount_paise: payment.amount_paise,
    });
    await tx.query(
      "UPDATE payments SET status = 'paid', gateway_payment_id = $2, method = $3, paid_at = now(), txn_ref = $4 WHERE id = $1",
      [payment.id, gatewayPaymentId, method, txn.id]
    );
    await tx.query("UPDATE users SET available_paise = available_paise + $2 WHERE id = $1", [payment.user_id, payment.amount_paise]);
    return { payment, credited: true, txn };
  });
  if (result.credited) {
    const user = await getUserById(db, result.payment.user_id);
    notifyUser(user, "Money added to your wallet", `₹${toRupees(result.payment.amount_paise).toLocaleString("en-IN")} has been added to your wallet.`);
  }
  return result;
}

// Called by the browser after Razorpay Checkout succeeds
export async function verifyCheckout(user, { orderId, paymentId, signature }) {
  requireEnabled();
  const { rows } = await db.query("SELECT * FROM payments WHERE gateway_order_id = $1 AND user_id = $2", [String(orderId), user.id]);
  const payment = rows[0];
  if (!payment) throw new HttpError(404, "Payment not found.");
  if (!same(hmac(config.razorpay.keySecret, `${orderId}|${paymentId}`), String(signature))) {
    throw badRequest("Payment could not be verified.");
  }
  if (payment.status === "paid") return { status: "paid", txn: null };

  // Confirm with Razorpay that the money was actually captured
  const p = await razorpay(`/payments/${encodeURIComponent(paymentId)}`);
  if (p.order_id !== payment.gateway_order_id) throw badRequest("Payment does not belong to this order.");
  if (p.status !== "captured") return { status: "processing", txn: null }; // the webhook will finish it
  const { txn } = await creditPayment(payment.gateway_order_id, p.id, p.method, p.amount);
  return { status: "paid", txn };
}

// POST /api/webhooks/razorpay with the raw request body
export async function handleWebhook(rawBody, signatureHeader) {
  const secret = config.razorpay.webhookSecret;
  if (!secret) throw new HttpError(503, "Webhook secret is not set.");
  if (!same(hmac(secret, rawBody), String(signatureHeader || ""))) throw new HttpError(400, "Bad signature.");
  const event = JSON.parse(rawBody);
  const p = event?.payload?.payment?.entity;
  if (event.event === "payment.captured" && p?.order_id) {
    const known = await db.query("SELECT 1 FROM payments WHERE gateway_order_id = $1", [p.order_id]);
    if (known.rowCount) await creditPayment(p.order_id, p.id, p.method, p.amount);
  } else if (event.event === "payment.failed" && p?.order_id) {
    await db.query("UPDATE payments SET status = 'failed' WHERE gateway_order_id = $1 AND status = 'created'", [p.order_id]);
  }
}
