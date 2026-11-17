// End-to-end API test against a temporary in-memory MongoDB.  Run: npm test
// External services (IFSC lookup, Razorpay) are replaced by a small local fake server.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { after, before, describe, test } from "node:test";

/* ---------- Fake IFSC + Razorpay API ---------- */
const fake = { payments: {} }; // paymentId -> { order_id, amount, status, method }
const fakeServer = http.createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = req.url;
    if (url.startsWith("/ifsc/")) {
      const code = url.slice(6);
      return code === "SBIN0001234" || code === "HDFC0001234"
        ? send(200, { BANK: code.startsWith("SBIN") ? "State Bank of India" : "HDFC Bank", BRANCH: "Main Branch", CITY: "AHMEDABAD", STATE: "GUJARAT", UPI: true })
        : send(404, "Not Found");
    }
    if (url === "/rzp/orders" && req.method === "POST") {
      const { amount } = JSON.parse(body);
      return send(200, { id: `order_${crypto.randomBytes(6).toString("hex")}`, amount, currency: "INR" });
    }
    const m = url.match(/^\/rzp\/payments\/(.+)$/);
    if (m && fake.payments[m[1]]) return send(200, { id: m[1], ...fake.payments[m[1]] });
    send(404, { error: { description: "not found" } });
  });
});
await new Promise((r) => fakeServer.listen(0, r));
const fakeBase = `http://127.0.0.1:${fakeServer.address().port}`;

// Uses the "<DATABASE_URL name>_test" database (e.g. jalaram_test). It is wiped at the start of every run.
process.env.NODE_ENV = "test";
process.env.SEED_DEMO = "true";
process.env.OTP_DEV_MODE = "true";
process.env.IFSC_API = `${fakeBase}/ifsc`;
process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = "test_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "hook_secret";
process.env.RAZORPAY_API_BASE = `${fakeBase}/rzp`;

const { createApp } = await import("../src/app.js");
const { connectDb, disconnectDb, query, resetDatabase } = await import("../src/db.js");
const { seedAll } = await import("../src/seed.js");

let server;
let base;
const hmac = (secret, text) => crypto.createHmac("sha256", secret).update(text).digest("hex");

async function call(method, path, { body, token, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(base + path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const type = res.headers.get("content-type") || "";
  return { status: res.status, data: type.includes("json") ? await res.json() : await res.arrayBuffer() };
}

before(async () => {
  await connectDb();
  await resetDatabase();
  await seedAll();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server?.close();
  fakeServer.close();
  await disconnectDb();
});

const loginAs = async (identifier, password) => (await call("POST", "/auth/login", { body: { identifier, password } })).data.token;
const adminLogin = async () => (await call("POST", "/auth/admin/login", { body: { username: "admin", password: "admin@123" } })).data.token;

describe("market", () => {
  test("catalog, rates, history and summary", async () => {
    const cat = await call("GET", "/market/catalog");
    assert.equal(cat.status, 200);
    assert.equal(cat.data.products.length, 3);
    assert.equal(cat.data.cities.length, 18);

    const rates = await call("GET", "/market/rates?city=Ahmedabad");
    assert.equal(rates.data.rates.length, 3);
    const potato = rates.data.rates.find((r) => r.product === "potato");
    assert.equal(potato.price, 389);
    assert.equal(potato.trend.length, 7);
    assert.equal(potato.trend.at(-1), 389);

    const hist = await call("GET", "/market/history?city=Ahmedabad&product=potato");
    assert.equal(hist.data.candles.length, 366);
    assert.equal(hist.data.candles.at(-1).c, 389);

    const sum = await call("GET", "/market/summary");
    assert.equal(sum.data.summary.length, 3);

    assert.equal((await call("GET", "/market/rates?city=Atlantis")).status, 404);
  });
});

describe("user account", () => {
  let token;

  test("login rejects a wrong password and accepts the demo login", async () => {
    assert.equal((await call("POST", "/auth/login", { body: { identifier: "test@gmail.com", password: "nope" } })).status, 401);
    const res = await call("POST", "/auth/login", { body: { identifier: "TEST@gmail.com", password: "123456" } });
    assert.equal(res.status, 200);
    assert.equal(res.data.user.name, "Test User");
    token = res.data.token;
  });

  test("me needs a token", async () => {
    assert.equal((await call("GET", "/me")).status, 401);
    const me = await call("GET", "/me", { token });
    assert.equal(me.data.user.wallet.available, 25000);
    assert.equal(me.data.user.wallet.onHold, 3200);
    assert.equal(me.data.user.bank, "HDFC Bank ••••4521");
  });

  test("buy: charges, wallet, holding average and passbook", async () => {
    const wrongPin = await call("POST", "/me/orders", { token, body: { product: "potato", city: "Ahmedabad", bags: 10, pin: "000000" } });
    assert.equal(wrongPin.status, 400);
    assert.match(wrongPin.data.error, /Incorrect PIN/);

    const res = await call("POST", "/me/orders", { token, body: { side: "Buy", product: "potato", city: "Ahmedabad", bags: 10, pin: "123456" } });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    // 10 × ₹389 = 3890; brokerage 19.45; fee 10; GST 18% of 29.45 = 5.30 → 3924.75
    assert.deepEqual(res.data.bill, { value: 3890, brokerage: 19.45, platformFee: 10, gst: 5.3, charges: 34.75, total: 3924.75 });
    assert.equal(res.data.wallet.available, 25000 - 3924.75);

    const h = await call("GET", "/me/holdings", { token });
    const potato = h.data.holdings.find((x) => x.product === "potato");
    assert.equal(potato.bags, 50);
    assert.equal(potato.avgCost, (40 * 405 + 10 * 389) / 50);

    const t = await call("GET", "/me/transactions", { token });
    assert.equal(t.data.transactions[0].type, "Bought");
    assert.equal(t.data.transactions[0].amount, -3924.75);
  });

  test("buy is refused when the wallet is short", async () => {
    const res = await call("POST", "/me/orders", { token, body: { product: "garlic", city: "Mumbai", bags: 500, pin: "123456" } });
    assert.equal(res.status, 400);
    assert.match(res.data.error, /Not enough money/);
  });

  test("parallel orders can never overdraw the wallet", async () => {
    const available = (await call("GET", "/me", { token })).data.user.wallet.available;
    // Each order costs a bit more than 40% of the wallet, so at most 2 of 6 can succeed
    const rate = (await call("GET", "/market/rates?city=Mumbai&product=garlic")).data.rates[0].price;
    const bags = Math.ceil((available * 0.4) / rate);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => call("POST", "/me/orders", { token, body: { product: "garlic", city: "Mumbai", bags, pin: "123456" } }))
    );
    const ok = results.filter((r) => r.status === 201).length;
    assert.ok(ok >= 1 && ok <= 2, `expected 1-2 fills, got ${ok}: ${results.map((r) => r.status)}`);
    const after = (await call("GET", "/me", { token })).data.user.wallet.available;
    assert.ok(after >= 0);
    const h = (await call("GET", "/me/holdings", { token })).data.holdings.find((x) => x.product === "garlic" && x.city === "Mumbai");
    assert.equal(h.bags, ok * bags);
  });

  test("sell credits proceeds and reduces the holding", async () => {
    const res = await call("POST", "/me/orders", { token, body: { side: "Sell", product: "onion", city: "Nashik", bags: 25, pin: "123456" } });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    const h = await call("GET", "/me/holdings", { token });
    assert.equal(h.data.holdings.find((x) => x.product === "onion"), undefined);
    const tooMany = await call("POST", "/me/orders", { token, body: { side: "Sell", product: "onion", city: "Nashik", bags: 1, pin: "123456" } });
    assert.equal(tooMany.status, 400);
  });

  test("card deposits are refused; UPI deposit stays pending", async () => {
    const card = await call("POST", "/me/wallet/deposits", { token, body: { amount: 1000, method: "Debit card" } });
    assert.equal(card.status, 422);
    const upi = await call("POST", "/me/wallet/deposits", { token, body: { amount: 1000, method: "UPI", upiApp: "PhonePe", upiId: "test@ybl" } });
    assert.equal(upi.status, 201);
    assert.equal(upi.data.transaction.status, "Pending");
  });

  test("withdrawal puts money on hold", async () => {
    const before = (await call("GET", "/me", { token })).data.user.wallet;
    const tooMuch = await call("POST", "/me/wallet/withdrawals", { token, body: { amount: 10_000_000, pin: "123456" } });
    assert.equal(tooMuch.status, 400);
    const res = await call("POST", "/me/wallet/withdrawals", { token, body: { amount: 500, pin: "123456" } });
    assert.equal(res.status, 201);
    assert.equal(res.data.wallet.available, Math.round((before.available - 500) * 100) / 100);
    assert.equal(res.data.wallet.onHold, before.onHold + 500);
  });
});

describe("admin", () => {
  let admin;
  let user;

  before(async () => {
    admin = (await call("POST", "/auth/admin/login", { body: { username: "admin", password: "admin@123" } })).data.token;
    user = (await call("POST", "/auth/login", { body: { identifier: "9876543210", password: "123456" } })).data.token;
  });

  test("user tokens can't open admin routes", async () => {
    assert.equal((await call("GET", "/admin/overview", { token: user })).status, 401);
    assert.equal((await call("POST", "/auth/admin/login", { body: { username: "admin", password: "x" } })).status, 401);
  });

  test("overview has users, requests, orders and rates", async () => {
    const res = await call("GET", "/admin/overview", { token: admin });
    assert.equal(res.status, 200);
    assert.ok(res.data.users.length >= 11);
    assert.ok(res.data.walletRequests.some((r) => r.id === "WR9012"));
    assert.equal(res.data.rates.potato.length, 18);
  });

  test("approving a deposit credits the wallet once", async () => {
    const before = (await call("GET", "/me", { token: user })).data.user.wallet.available;
    const ov = await call("GET", "/admin/overview", { token: admin });
    const req = ov.data.walletRequests.find((r) => r.userId === "JAB-2026-004800" && r.type === "in" && r.status === "pending");
    const ok = await call("POST", `/admin/wallet-requests/${req.id}/decision`, { token: admin, body: { approve: true } });
    assert.equal(ok.status, 200);
    assert.equal((await call("GET", "/me", { token: user })).data.user.wallet.available, before + 1000);
    const again = await call("POST", `/admin/wallet-requests/${req.id}/decision`, { token: admin, body: { approve: true } });
    assert.equal(again.status, 409);
  });

  test("rejecting a withdrawal returns the held money", async () => {
    const before = (await call("GET", "/me", { token: user })).data.user.wallet;
    const res = await call("POST", "/admin/wallet-requests/WR9014/decision", { token: admin, body: { approve: false } });
    assert.equal(res.status, 200);
    const after = (await call("GET", "/me", { token: user })).data.user.wallet;
    assert.equal(after.available, before.available + 3200);
    assert.equal(after.onHold, before.onHold - 3200);
  });

  test("rate update shows on the public page", async () => {
    const bad = await call("PUT", "/admin/rates/potato/Ahmedabad", { token: admin, body: { today: 500, low: 380, high: 450, arrivals: 3000 } });
    assert.equal(bad.status, 400);
    const ok = await call("PUT", "/admin/rates/potato/Ahmedabad", { token: admin, body: { today: 395, low: 360, high: 430, arrivals: 3100 } });
    assert.equal(ok.status, 200);
    const pub = await call("GET", "/market/rates?city=Ahmedabad&product=potato");
    assert.equal(pub.data.rates[0].price, 395);
    assert.equal(pub.data.rates[0].trend.at(-1), 395);
  });

  test("blocking a user stops their login", async () => {
    await call("PATCH", "/admin/users/JAB-2026-004821", { token: admin, body: { blocked: true } });
    const res = await call("POST", "/auth/login", { body: { identifier: "rakesh.patel@example.com", password: "Demo@1234" } });
    assert.equal(res.status, 403);
  });
});

describe("registration", () => {
  const jpeg = () => new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(60).fill(1)])], { type: "image/jpeg" });

  async function verified(channel, target) {
    assert.equal((await call("POST", "/auth/otp/send", { body: { channel, target } })).status, 200);
    const bad = await call("POST", "/auth/otp/verify", { body: { channel, target, code: "000000" } });
    assert.equal(bad.status, 400);
    const ok = await call("POST", "/auth/otp/verify", { body: { channel, target, code: "123456" } });
    assert.equal(ok.status, 200);
    return ok.data.token;
  }

  test("OTP refuses an already registered email", async () => {
    assert.equal((await call("POST", "/auth/otp/send", { body: { channel: "email", target: "test@gmail.com" } })).status, 409);
  });

  test("full sign-up creates a pending-KYC user with documents", async () => {
    const fields = {
      mobile: "9123456780", email: "new.user@example.com",
      fullName: "New User", pan: "PQRST6789K", dob: "1990-05-01", gender: "Female", maritalStatus: "Single",
      fatherName: "Father Name", occupation: "Farmer", income: "Below ₹5 lakh", experience: "Beginner", pep: "no", taxResident: "true",
      aadhaarLast4: "1234", address: "12 Market Road", city: "Deesa", pincode: "385535", state: "Gujarat",
      accountHolder: "New User", accountNumber: "123456789012", confirmAccountNumber: "123456789012", ifsc: "SBIN0001234", accountType: "Savings",
      password: "Strong@123", confirmPassword: "Strong@123", pin: "654321", confirmPin: "654321",
      riskAck: "true", dataConsent: "true", terms: "true", marketing: "false",
    };

    // Missing OTP proof and files → field errors
    const form0 = new FormData();
    Object.entries(fields).forEach(([k, v]) => form0.append(k, v));
    const missing = await call("POST", "/auth/register", { form: form0 });
    assert.equal(missing.status, 400);
    assert.ok(missing.data.fields.mobile && missing.data.fields.panCard);

    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    form.append("mobileToken", await verified("mobile", fields.mobile));
    form.append("emailToken", await verified("email", fields.email));
    for (const key of ["panCard", "aadhaarFront", "selfie", "signature", "cheque"]) form.append(key, jpeg(), `${key}.jpg`);

    const res = await call("POST", "/auth/register", { form });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    assert.equal(res.data.user.kyc, "pending");

    // KYC pending → can't trade yet
    const trade = await call("POST", "/me/orders", { token: res.data.token, body: { product: "potato", city: "Deesa", bags: 1, pin: "654321" } });
    assert.equal(trade.status, 403);

    // Admin can view the uploaded document
    const adminToken = (await call("POST", "/auth/admin/login", { body: { username: "admin", password: "admin@123" } })).data.token;
    const detail = await call("GET", `/admin/users/${res.data.user.clientId}`, { token: adminToken });
    assert.equal(detail.data.user.documents.length, 5);
    const file = await call("GET", `/admin/users/${res.data.user.clientId}/documents/selfie`, { token: adminToken });
    assert.equal(file.status, 200);
    assert.equal(Buffer.from(file.data)[0], 0xff);
  });

  test("a fake image (wrong bytes) is rejected", async () => {
    const form = new FormData();
    form.append("selfie", new Blob(["<script>alert(1)</script>"], { type: "image/jpeg" }), "x.jpg");
    const res = await call("POST", "/auth/register", { form });
    assert.equal(res.status, 400);
    assert.ok(res.data.fields.selfie);
  });
});

describe("security", () => {
  test("PAN and bank account are encrypted in the database, readable by admin", async () => {
    const raw = (await query("SELECT * FROM users WHERE email = 'test@gmail.com'")).rows[0];
    assert.equal(raw.pan, undefined);
    assert.ok(raw.pan_enc.startsWith("v1:"));
    assert.ok(!JSON.stringify(raw).includes("ABCDE1234F"));
    assert.ok(!JSON.stringify(raw).includes("50100012344521"));
    const admin = await adminLogin();
    const d = await call("GET", "/admin/users/JAB-2026-004800", { token: admin });
    assert.equal(d.data.user.profile.pan, "ABCDE1234F");
    assert.equal(d.data.user.bank.accountNumber, "50100012344521");
    assert.equal(d.data.user.profile.panEnc, undefined);
    const me = await call("GET", "/me", { token: await loginAs("test@gmail.com", "123456") });
    assert.equal(me.data.user.pan, "ABCDE••••F");
  });

  test("IFSC lookup", async () => {
    assert.equal((await call("GET", "/auth/ifsc/SBIN0001234")).data.bank.bank, "State Bank of India");
    assert.equal((await call("GET", "/auth/ifsc/SBIN0009999")).status, 404);
  });

  test("two-step login needs password to enable, then an OTP", async () => {
    const token = await loginAs("meena.shah@example.com", "Demo@1234");
    assert.equal((await call("PATCH", "/me/settings", { token, body: { twoFactor: true, password: "wrong" } })).status, 400);
    const on = await call("PATCH", "/me/settings", { token, body: { twoFactor: true, password: "Demo@1234" } });
    assert.equal(on.data.user.twoFactor, true);

    const step1 = await call("POST", "/auth/login", { body: { identifier: "meena.shah@example.com", password: "Demo@1234" } });
    assert.equal(step1.data.twoFactor, true);
    assert.equal(step1.data.token, undefined);
    assert.equal((await call("POST", "/auth/login/verify", { body: { challenge: step1.data.challenge, code: "000000" } })).status, 400);
    const step2 = await call("POST", "/auth/login/verify", { body: { challenge: step1.data.challenge, code: "123456" } });
    assert.equal(step2.status, 200);
    assert.ok(step2.data.token);
    await call("PATCH", "/me/settings", { token: step2.data.token, body: { twoFactor: false, password: "Demo@1234" } });
  });

  test("forgot password: OTP reset signs out old sessions", async () => {
    const old = await loginAs("9909023415", "Demo@1234");
    const forgot = await call("POST", "/auth/password/forgot", { body: { identifier: "9909023415" } });
    assert.equal(forgot.status, 200);
    // Unknown accounts get the same answer
    assert.equal((await call("POST", "/auth/password/forgot", { body: { identifier: "nobody@example.com" } })).status, 200);
    assert.equal((await call("POST", "/auth/password/reset", { body: { identifier: "9909023415", code: "123456", password: "weak" } })).status, 400);
    const reset = await call("POST", "/auth/password/reset", { body: { identifier: "9909023415", code: "123456", password: "NewPass@2026" } });
    assert.equal(reset.status, 200);
    assert.equal((await call("GET", "/me", { token: old })).status, 401);
    assert.ok(await loginAs("9909023415", "NewPass@2026"));
  });

  test("change password, reset PIN, log out everywhere", async () => {
    let token = await loginAs("neha.desai@example.com", "Demo@1234");
    assert.equal((await call("POST", "/me/password", { token, body: { currentPassword: "nope", newPassword: "Better@2026" } })).status, 400);
    const ch = await call("POST", "/me/password", { token, body: { currentPassword: "Demo@1234", newPassword: "Better@2026" } });
    assert.equal(ch.status, 200);
    assert.equal((await call("GET", "/me", { token })).status, 401); // old token is dead
    token = ch.data.token;
    assert.equal((await call("GET", "/me", { token })).status, 200);

    assert.equal((await call("POST", "/me/pin/otp", { token })).status, 200);
    assert.equal((await call("POST", "/me/pin", { token, body: { password: "Better@2026", code: "123456", pin: "246810" } })).status, 200);
    const buy = await call("POST", "/me/orders", { token, body: { product: "potato", city: "Surat", bags: 1, pin: "246810" } });
    assert.equal(buy.status, 201, JSON.stringify(buy.data));

    assert.equal((await call("POST", "/me/logout-all", { token })).status, 200);
    assert.equal((await call("GET", "/me", { token })).status, 401);
  });
});

describe("KYC review", () => {
  const png = () => new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(40).fill(0)])], { type: "image/png" });

  test("reject needs a reason, user re-uploads, back to review, audit log records it", async () => {
    const admin = await adminLogin();
    assert.equal((await call("PATCH", "/admin/users/JAB-2026-004830", { token: admin, body: { kyc: "rejected" } })).status, 400);
    const rej = await call("PATCH", "/admin/users/JAB-2026-004830", { token: admin, body: { kyc: "rejected", note: "PAN photo is blurry" } });
    assert.equal(rej.data.user.kyc, "rejected");

    const user = await loginAs("imran.qureshi@example.com", "Demo@1234");
    const me = await call("GET", "/me", { token: user });
    assert.equal(me.data.user.kycNote, "PAN photo is blurry");

    const form = new FormData();
    form.append("panCard", png(), "pan.png");
    const up = await call("POST", "/me/kyc/documents", { token: user, form });
    assert.equal(up.status, 200, JSON.stringify(up.data));
    assert.equal(up.data.user.kyc, "pending");
    assert.deepEqual(up.data.user.documents, ["panCard"]);

    const log = await call("GET", "/admin/audit", { token: admin });
    assert.ok(log.data.entries.some((e) => e.action === "kyc.rejected" && e.target === "JAB-2026-004830"));
    assert.ok(log.data.entries.some((e) => e.action === "wallet.approve"));
  });

  test("verified users can't replace documents", async () => {
    const form = new FormData();
    form.append("panCard", png(), "pan.png");
    const res = await call("POST", "/me/kyc/documents", { token: await loginAs("test@gmail.com", "123456"), form });
    assert.equal(res.status, 409);
  });
});

describe("online payments (Razorpay)", () => {
  let token;
  before(async () => {
    token = await loginAs("vikram.singh@example.com", "Demo@1234");
  });
  const wallet = async () => (await call("GET", "/me", { token })).data.user.wallet.available;
  const webhook = (event, signature) =>
    fetch(`${base}/webhooks/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Razorpay-Signature": signature },
      body: event,
    });

  test("config tells the frontend payments are on", async () => {
    assert.equal((await call("GET", "/config")).data.razorpayKeyId, "rzp_test_key");
  });

  test("checkout: bad signature refused, good one credits once", async () => {
    const start = await wallet();
    const order = await call("POST", "/me/wallet/payments", { token, body: { amount: 1500 } });
    assert.equal(order.status, 201);
    assert.equal(order.data.checkout.amount, 150000);
    const orderId = order.data.checkout.orderId;
    fake.payments.pay_one = { order_id: orderId, amount: 150000, status: "captured", method: "upi" };

    const bad = await call("POST", "/me/wallet/payments/verify", { token, body: { orderId, paymentId: "pay_one", signature: "deadbeef" } });
    assert.equal(bad.status, 400);

    const signature = hmac("test_secret", `${orderId}|pay_one`);
    const ok = await call("POST", "/me/wallet/payments/verify", { token, body: { orderId, paymentId: "pay_one", signature } });
    assert.equal(ok.data.status, "paid");
    assert.equal(ok.data.transaction.desc, "Razorpay · UPI");
    assert.equal(await wallet(), start + 1500);

    // Same payment again (browser retry + webhook) must not credit twice
    await call("POST", "/me/wallet/payments/verify", { token, body: { orderId, paymentId: "pay_one", signature } });
    const event = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_one", ...fake.payments.pay_one } } } });
    assert.equal((await webhook(event, hmac("hook_secret", event))).status, 200);
    assert.equal(await wallet(), start + 1500);
  });

  test("webhook alone credits a payment the browser never confirmed", async () => {
    const start = await wallet();
    const { orderId } = (await call("POST", "/me/wallet/payments", { token, body: { amount: 700 } })).data.checkout;
    const event = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_two", order_id: orderId, amount: 70000, method: "card" } } } });
    assert.equal((await webhook(event, "forged")).status, 400);
    assert.equal((await webhook(event, hmac("hook_secret", event))).status, 200);
    assert.equal(await wallet(), start + 700);
  });
});
