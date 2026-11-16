// All balances are stored as whole paise (integers) so additions never drift.
// The API speaks rupees; convert at the edges with these helpers.

export const toPaise = (rupees) => Math.round(Number(rupees) * 100);
export const toRupees = (paise) => Math.round(paise) / 100;

export const MAX_BAGS = 500;
export const MIN_WALLET_AMOUNT = 100; // ₹
export const MAX_DEPOSIT = 200000; // ₹ per request

const BROKERAGE_RATE = 0.005; // 0.5% of order value
const PLATFORM_FEE_PAISE = 1000; // ₹10 per order
const GST_RATE = 0.18; // 18% GST on charges

export const CHARGES = { brokerageRate: BROKERAGE_RATE, platformFee: toRupees(PLATFORM_FEE_PAISE), gstRate: GST_RATE };

// Bill for an order of `bags` at `ratePaise` per bag. Every amount is in paise.
export function quote(ratePaise, bags) {
  const value = ratePaise * bags;
  const brokerage = Math.round(value * BROKERAGE_RATE);
  const platformFee = PLATFORM_FEE_PAISE;
  const gst = Math.round((brokerage + platformFee) * GST_RATE);
  const charges = brokerage + platformFee + gst;
  return { value, brokerage, platformFee, gst, charges, total: value + charges };
}

export const quoteInRupees = (q) => Object.fromEntries(Object.entries(q).map(([k, v]) => [k, toRupees(v)]));
