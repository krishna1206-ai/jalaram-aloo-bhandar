// Shapes the API returns. Money leaves the server in rupees; sensitive numbers are masked.
import { toRupees } from "../money.js";
import { readAccountNumber, readPan } from "../records.js";

const BANKS = {
  HDFC: "HDFC Bank", SBIN: "SBI", ICIC: "ICICI Bank", UTIB: "Axis Bank", KKBK: "Kotak Bank",
  PUNB: "PNB", BARB: "Bank of Baroda", CNRB: "Canara Bank", UBIN: "Union Bank", IDFB: "IDFC First Bank",
  YESB: "Yes Bank", INDB: "IndusInd Bank", BKID: "Bank of India", IOBA: "Indian Overseas Bank",
};

export const bankName = (bank) => bank?.bankName || BANKS[(bank?.ifsc || "").slice(0, 4)] || (bank?.ifsc || "").slice(0, 4) || "Bank";
export const bankLabel = (bank) => (bank?.accountLast4 ? `${bankName(bank)} ••••${bank.accountLast4}` : "Not added");

const maskMobile = (m = "") => (m.length === 10 ? `+91 ${m.slice(0, 2)}•••••${m.slice(-3)}` : m);
const ms = (d) => new Date(d).getTime();

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

// `documents` = keys of uploaded KYC files
export function meView(user, documents = []) {
  const n = user.nominee;
  return {
    ...sessionUser(user),
    mobile: maskMobile(user.mobile),
    pan: user.profile?.panMasked || "",
    bank: bankLabel(user.bank),
    ifsc: user.bank?.ifsc || "",
    branch: user.bank?.branch || "",
    nominee: n?.name ? `${n.name}${n.relation ? ` (${n.relation})` : ""}` : "Not added",
    kycNote: user.kyc?.status === "rejected" ? user.kyc?.note || "" : "",
    documents,
    blocked: user.blocked,
    twoFactor: Boolean(user.twoFactor),
    marketing: Boolean(user.consents?.marketing),
    memberSince: user.createdAt,
    lastLogin: user.prevLoginAt || user.lastLoginAt || null,
    pinLocked: Boolean(user.pinLockedUntil && new Date(user.pinLockedUntil) > new Date()),
    wallet: walletView(user),
  };
}

// Rows from the transactions / orders / wallet_requests tables
export const txnView = (t) => ({
  id: t.txn_id,
  type: t.type,
  desc: t.descr,
  amount: toRupees(t.amount_paise),
  date: t.created_at,
  status: t.status,
});

export const orderView = (o, clientId = o.client_id) => ({
  id: o.order_id,
  userId: clientId,
  side: o.side,
  item: o.product,
  city: o.city,
  bags: o.bags,
  rate: toRupees(o.rate_paise),
  charges: toRupees(o.charges_paise),
  total: toRupees(o.total_paise),
  time: ms(o.created_at),
});

export const requestView = (r, clientId = r.client_id) => ({
  id: r.req_id,
  userId: clientId,
  type: r.type,
  amount: toRupees(r.amount_paise),
  method: r.method,
  status: r.status,
  time: ms(r.created_at),
});

// Row in the admin users table
export const adminUserView = (u) => ({
  id: u.clientId,
  name: u.name,
  mobile: u.mobile.length === 10 ? `${u.mobile.slice(0, 5)} ${u.mobile.slice(5)}` : u.mobile,
  email: u.email,
  city: u.address?.city || "",
  kyc: u.kyc?.status,
  kycNote: u.kyc?.note || "",
  blocked: u.blocked,
  balance: toRupees(u.availablePaise),
  onHold: toRupees(u.onHoldPaise),
  joined: ms(u.createdAt),
});

// Everything an admin needs to check a KYC application (decrypted)
export const adminUserDetail = (u, documents = []) => {
  const { panEnc, ...profile } = u.profile || {};
  const { accountNumberEnc, ...bank } = u.bank || {};
  return {
    ...adminUserView(u),
    mobileFull: u.mobile,
    profile: { ...profile, pan: readPan(u) },
    address: u.address,
    bank: { ...bank, accountNumber: readAccountNumber(u), bankName: bankName(u.bank) },
    nominee: u.nominee,
    consents: u.consents,
    documents,
  };
};
