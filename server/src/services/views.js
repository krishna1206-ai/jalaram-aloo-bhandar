// Shapes the API returns. Money leaves the server in rupees; sensitive numbers are masked.
import { toRupees } from "../money.js";

const BANKS = {
  HDFC: "HDFC Bank", SBIN: "SBI", ICIC: "ICICI Bank", UTIB: "Axis Bank", KKBK: "Kotak Bank",
  PUNB: "PNB", BARB: "Bank of Baroda", CNRB: "Canara Bank", UBIN: "Union Bank", IDFB: "IDFC First Bank",
  YESB: "Yes Bank", INDB: "IndusInd Bank", BKID: "Bank of India", IOBA: "Indian Overseas Bank",
};

export const bankName = (ifsc = "") => BANKS[ifsc.slice(0, 4)] || ifsc.slice(0, 4) || "Bank";
export const bankLabel = (bank) => (bank?.accountNumber ? `${bankName(bank.ifsc)} ••••${bank.accountNumber.slice(-4)}` : "Not added");

const maskMobile = (m = "") => (m.length === 10 ? `+91 ${m.slice(0, 2)}•••••${m.slice(-3)}` : m);
const maskPan = (p = "") => (p.length === 10 ? `${p.slice(0, 5)}••••${p.slice(-1)}` : p);

export function walletView(user) {
  return { available: toRupees(user.availablePaise), onHold: toRupees(user.onHoldPaise) };
}

// Small summary kept by the browser for the navbar (no sensitive fields)
export function sessionUser(user) {
  return {
    name: user.name,
    email: user.email,
    clientId: user.clientId,
    kyc: user.kyc?.status,
    balance: toRupees(user.availablePaise),
  };
}

export function meView(user) {
  const n = user.nominee;
  return {
    ...sessionUser(user),
    mobile: maskMobile(user.mobile),
    pan: maskPan(user.profile?.pan),
    bank: bankLabel(user.bank),
    ifsc: user.bank?.ifsc || "",
    nominee: n?.name ? `${n.name}${n.relation ? ` (${n.relation})` : ""}` : "Not added",
    blocked: user.blocked,
    memberSince: user.createdAt,
    lastLogin: user.prevLoginAt || user.lastLoginAt || null,
    pinLocked: Boolean(user.pinLockedUntil && user.pinLockedUntil > new Date()),
    wallet: walletView(user),
  };
}

export const txnView = (t) => ({
  id: t.txnId,
  type: t.type,
  desc: t.desc,
  amount: toRupees(t.amountPaise),
  date: t.createdAt,
  status: t.status,
});

export const orderView = (o, user) => ({
  id: o.orderId,
  userId: user?.clientId,
  side: o.side,
  item: o.product,
  city: o.city,
  bags: o.bags,
  rate: toRupees(o.ratePaise),
  charges: toRupees(o.chargesPaise),
  total: toRupees(o.totalPaise),
  time: new Date(o.createdAt).getTime(),
});

export const requestView = (r, user) => ({
  id: r.reqId,
  userId: user?.clientId,
  type: r.type,
  amount: toRupees(r.amountPaise),
  method: r.method,
  status: r.status,
  time: new Date(r.createdAt).getTime(),
});

// Row in the admin users table
export const adminUserView = (u) => ({
  id: u.clientId,
  name: u.name,
  mobile: u.mobile.length === 10 ? `${u.mobile.slice(0, 5)} ${u.mobile.slice(5)}` : u.mobile,
  email: u.email,
  city: u.address?.city || "",
  kyc: u.kyc?.status,
  blocked: u.blocked,
  balance: toRupees(u.availablePaise),
  onHold: toRupees(u.onHoldPaise),
  joined: new Date(u.createdAt).getTime(),
});

// Everything an admin needs to check a KYC application
export const adminUserDetail = (u) => ({
  ...adminUserView(u),
  mobileFull: u.mobile,
  profile: u.profile,
  address: u.address,
  bank: { ...u.bank, bankName: bankName(u.bank?.ifsc) },
  nominee: u.nominee,
  consents: u.consents,
  documents: (u.documents || []).map(({ key, filename, contentType, size }) => ({ key, filename, contentType, size })),
});
