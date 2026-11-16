// End-to-end API test against a temporary in-memory MongoDB.  Run: npm test
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "";
process.env.SEED_DEMO = "true";
process.env.OTP_DEV_MODE = "true";

const { createApp } = await import("../src/app.js");
const { connectDb, disconnectDb } = await import("../src/db.js");
const { ensureIndexes, seedAll } = await import("../src/seed.js");

let server;
let base;

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
  await ensureIndexes();
  await seedAll();
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server?.close();
  await disconnectDb();
});

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
