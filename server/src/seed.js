import mongoose from "mongoose";
import { config } from "./config.js";
import { toPaise } from "./money.js";
import { Admin, AuditLog, Holding, Order, Otp, Payment, Rate, Transaction, User, WalletRequest, accountFields, panFields } from "./models/index.js";
import { seedRates } from "./services/rates.js";
import { hashSecret } from "./services/security.js";

// Creates the admin account from ADMIN_USERNAME / ADMIN_PASSWORD the first time the server starts.
export async function seedAdmin() {
  const username = config.adminUsername.toLowerCase();
  if (!username || (await Admin.exists({ username }))) return false;
  await Admin.create({ username, passwordHash: await hashSecret(config.adminPassword) });
  if (!config.isTest) console.log(`Created admin account "${username}".`);
  return true;
}

function at(daysAgo, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d;
}

const DEMO_USERS = [
  // clientId, name, mobile, city, state, kyc, blocked, balance ₹, joined [daysAgo, time], ifsc, account
  ["JAB-2026-004821", "Rakesh Patel", "9825041120", "Ahmedabad", "Gujarat", "verified", false, 48250.75, [40, "11:00"], "ICIC0000123", "001201552209"],
  ["JAB-2026-004822", "Meena Shah", "9909023415", "Surat", "Gujarat", "verified", false, 62400, [38, "16:20"], "HDFC0000456", "50100023414410"],
  ["JAB-2026-004827", "Arjun Mehta", "9727780913", "Rajkot", "Gujarat", "verified", true, 15200, [35, "10:05"], "UTIB0000789", "917010045531"],
  ["JAB-2026-004830", "Imran Qureshi", "9898055107", "Mumbai", "Maharashtra", "pending", false, 0, [1, "14:45"], "SBIN0001234", "30221456781"],
  ["JAB-2026-004833", "Sunita Yadav", "9414077231", "Agra", "Uttar Pradesh", "verified", false, 21486.25, [30, "09:30"], "PUNB0012300", "0123000100099"],
  ["JAB-2026-004836", "Neha Desai", "9099061882", "Vadodara", "Gujarat", "verified", false, 54800, [25, "18:10"], "HDFC0000321", "50100088211234"],
  ["JAB-2026-004841", "Priya Nair", "9847031266", "Bengaluru", "Karnataka", "pending", false, 9000, [2, "12:00"], "UTIB0000222", "918020011122"],
  ["JAB-2026-004845", "Vikram Singh", "9811044590", "Delhi", "Delhi", "verified", false, 71000, [20, "15:15"], "SBIN0005678", "30117787782"],
  ["JAB-2026-004852", "Mohit Agarwal", "9831020984", "Kolkata", "West Bengal", "verified", false, 38000, [12, "11:40"], "KKBK0000555", "4511223344"],
  ["JAB-2026-004858", "Kavita Joshi", "9601088342", "Indore", "Madhya Pradesh", "pending", false, 0, [0, "08:05"], "BARB0INDORE", "12340100009876"],
];

const DEMO_REQUESTS = [
  // reqId, clientId, type, amount, method, [daysAgo, time], status
  ["WR9012", "JAB-2026-004822", "out", 20000, "Bank · HDFC Bank ••••4410", [0, "09:40"], "pending"],
  ["WR9011", "JAB-2026-004841", "in", 15000, "UPI · Google Pay · priya@okaxis", [0, "08:15"], "pending"],
  ["WR9008", "JAB-2026-004845", "out", 12500, "Bank · SBI ••••7782", [1, "17:02"], "pending"],
  ["WR9006", "JAB-2026-004833", "in", 8000, "UPI · PhonePe · sunita@ybl", [1, "11:30"], "pending"],
  ["WR8990", "JAB-2026-004821", "out", 5000, "Bank · ICICI Bank ••••2209", [6, "14:10"], "pending"],
  ["WR8975", "JAB-2026-004836", "in", 25000, "UPI · Google Pay · neha@okhdfc", [8, "10:20"], "approved"],
  ["WR8961", "JAB-2026-004852", "in", 10000, "Bank transfer · UTR KKBKN52026101012345", [10, "13:05"], "approved"],
  ["WR8944", "JAB-2026-004827", "out", 30000, "Bank · Axis Bank ••••5531", [14, "16:40"], "rejected"],
  ["WR9014", "JAB-2026-004800", "out", 3200, "Bank · HDFC Bank ••••4521", [0, "10:30"], "pending"],
];

const DEMO_ORDERS = [
  ["OR55120", "JAB-2026-004822", "Buy", "onion", "Nashik", 40, 472, [0, "10:12"]],
  ["OR55118", "JAB-2026-004845", "Buy", "potato", "Agra", 60, 346, [0, "09:58"]],
  ["OR55111", "JAB-2026-004821", "Buy", "garlic", "Mandsaur", 8, 541, [0, "09:20"]],
  ["OR55104", "JAB-2026-004833", "Sell", "potato", "Agra", 15, 351, [1, "15:44"]],
  ["OR55097", "JAB-2026-004852", "Buy", "potato", "Kolkata", 25, 382, [1, "12:31"]],
  ["OR55083", "JAB-2026-004836", "Buy", "onion", "Surat", 30, 598, [3, "11:02"]],
  ["OR55071", "JAB-2026-004821", "Sell", "potato", "Ahmedabad", 10, 421, [5, "16:18"]],
  ["OR55060", "JAB-2026-004845", "Buy", "garlic", "Delhi", 12, 752, [7, "10:47"]],
  ["OR55040", "JAB-2026-004800", "Buy", "potato", "Ahmedabad", 10, 425, [0, "11:20"]],
];

// The demo login: test@gmail.com / 123456, transaction PIN 123456
const TEST_USER = {
  clientId: "JAB-2026-004800",
  name: "Test User",
  email: "test@gmail.com",
  mobile: "9876543210",
  password: "123456",
  available: 25000,
  holdings: [
    ["potato", "Ahmedabad", 40, 405],
    ["onion", "Nashik", 25, 520],
    ["garlic", "Indore", 30, 700],
  ],
  txns: [
    ["TXN100245", "Bought", "10 bags potato · Ahmedabad", -4318.6, [0, "11:20"]],
    ["TXN100244", "Added money", "UPI · Google Pay", 10000, [0, "10:05"]],
    ["TXN100243", "Charges", "Storage charges · October", -186.5, [1, "18:00"]],
    ["TXN100242", "Sold", "5 bags onion · Nashik", 2712.4, [2, "15:42"]],
    ["TXN100241", "Withdrawal", "To HDFC Bank ••••4521", -5000, [3, "09:30"]],
    ["TXN100240", "Bought", "30 bags garlic · Indore", -21142.8, [6, "12:10"]],
    ["TXN100239", "Added money", "Bank transfer · NEFT", 40000, [7, "16:45"]],
  ],
};

async function wipeUserData() {
  await Promise.all([User, WalletRequest, Transaction, Order, Holding, Otp, Payment].map((M) => M.deleteMany({})));
  await new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "kyc" }).drop().catch(() => {});
}

export async function seedDemoData({ reset = false } = {}) {
  if (reset) {
    await wipeUserData();
    await seedRates({ force: true });
  } else if ((await User.estimatedDocumentCount()) > 0) {
    return false;
  }

  const [demoPassword, testPassword, pin] = await Promise.all([hashSecret("Demo@1234"), hashSecret(TEST_USER.password), hashSecret("123456")]);
  const onHold = {};
  for (const [, clientId, type, amount, , , status] of DEMO_REQUESTS) {
    if (type === "out" && status === "pending") onHold[clientId] = (onHold[clientId] || 0) + toPaise(amount);
  }

  const base = (clientId, name, mobile, city, state, kyc, blocked, availablePaise, joined, ifsc, accountNumber, extra = {}) => ({
    clientId, name, mobile, kyc: { status: kyc }, blocked, availablePaise, onHoldPaise: onHold[clientId] || 0,
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    passwordHash: demoPassword, pinHash: pin,
    profile: { ...panFields(`DEMOA${clientId.slice(-4)}X`), gender: "Other", occupation: "Commodity trader", taxResident: true },
    address: { city, state, pincode: "380001", line: "Demo address" },
    bank: { accountHolder: name, ...accountFields(accountNumber), ifsc, accountType: "Savings" },
    consents: { riskAck: true, dataConsent: true, terms: true, marketing: false, at: joined },
    createdAt: joined,
    ...extra,
  });

  const users = await User.insertMany([
    base(TEST_USER.clientId, TEST_USER.name, TEST_USER.mobile, "Ahmedabad", "Gujarat", "verified", false, toPaise(TEST_USER.available), at(30, "10:00"), "HDFC0001234", "50100012344521", {
      email: TEST_USER.email,
      passwordHash: testPassword,
      profile: { ...panFields("ABCDE1234F"), gender: "Other", occupation: "Commodity trader", taxResident: true },
      nominee: {},
    }),
    ...DEMO_USERS.map(([id, name, mobile, city, state, kyc, blocked, bal, [d, t], ifsc, acc]) =>
      base(id, name, mobile, city, state, kyc, blocked, toPaise(bal), at(d, t), ifsc, acc)
    ),
  ]);
  const userId = Object.fromEntries(users.map((u) => [u.clientId, u._id]));

  // Wallet requests, each with its passbook entry
  let txnNo = 100250;
  const requests = [];
  const txns = [];
  for (const [reqId, clientId, type, amount, method, [d, t], status] of DEMO_REQUESTS) {
    const _id = new mongoose.Types.ObjectId();
    const txnOid = new mongoose.Types.ObjectId();
    const time = at(d, t);
    requests.push({ _id, reqId, user: userId[clientId], type, amountPaise: toPaise(amount), method, status, txn: txnOid, createdAt: time, ...(status !== "pending" && { decidedAt: time }) });
    txns.push({
      _id: txnOid,
      txnId: `TXN${txnNo++}`,
      user: userId[clientId],
      type: type === "in" ? "Added money" : "Withdrawal",
      desc: type === "in" ? method.split(" · ").slice(0, 2).join(" · ") : `To ${method.replace("Bank · ", "")}`,
      amountPaise: type === "in" ? toPaise(amount) : -toPaise(amount),
      status: status === "pending" ? "Pending" : status === "approved" ? "Completed" : "Rejected",
      walletRequest: _id,
      createdAt: time,
    });
  }
  for (const [txnId, type, desc, amount, [d, t]] of TEST_USER.txns) {
    txns.push({ txnId, user: userId[TEST_USER.clientId], type, desc, amountPaise: toPaise(amount), status: "Completed", createdAt: at(d, t) });
  }

  await WalletRequest.insertMany(requests);
  await Transaction.insertMany(txns);
  await Order.insertMany(
    DEMO_ORDERS.map(([orderId, clientId, side, product, city, bags, rate, [d, t]]) => ({
      orderId, user: userId[clientId], side, product, city, bags, ratePaise: toPaise(rate),
      chargesPaise: 0, totalPaise: toPaise(rate * bags), createdAt: at(d, t),
    }))
  );
  await Holding.insertMany(
    TEST_USER.holdings.map(([product, city, bags, avg]) => ({ user: userId[TEST_USER.clientId], product, city, bags, avgCostPaise: toPaise(avg) }))
  );
  if (!config.isTest) console.log("Loaded demo data. Demo login: test@gmail.com / 123456, PIN 123456.");
  return true;
}

export async function seedAll() {
  await seedAdmin();
  await seedRates();
  if (config.seedDemo) await seedDemoData();
}

// Builds collections and unique indexes before the first request (transactions can't create them)
export async function ensureIndexes() {
  await Promise.all([User, Admin, Otp, Rate, WalletRequest, Transaction, Order, Holding, Payment, AuditLog].map((M) => M.init()));
}
