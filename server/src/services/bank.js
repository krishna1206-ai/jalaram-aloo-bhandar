import { config } from "../config.js";
import { HttpError } from "../errors.js";

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// Looks up an IFSC code (free public API, no key needed). Returns null if the code does not exist.
export async function lookupIfsc(code) {
  const ifsc = String(code || "").trim().toUpperCase();
  if (!IFSC_RE.test(ifsc)) return null;
  let res;
  try {
    res = await fetch(`${config.ifscApi}/${ifsc}`, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new HttpError(502, "Bank lookup is not responding. Please try again.");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(502, "Bank lookup is not responding. Please try again.");
  const d = await res.json();
  return { ifsc, bank: d.BANK, branch: d.BRANCH, city: d.CITY, state: d.STATE, upi: Boolean(d.UPI), neft: Boolean(d.NEFT), imps: Boolean(d.IMPS) };
}
