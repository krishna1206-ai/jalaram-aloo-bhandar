import { createContext, useContext, useEffect, useState } from "react";

export const USD_RATE = 88; // 1 USD = ₹88 — change this to your rate

const CurrencyContext = createContext(null);

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(() => {
    try {
      return localStorage.getItem("jab-currency") || "both";
    } catch {
      return "both";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("jab-currency", currency);
    } catch {
      /* ignore */
    }
  }, [currency]);

  return <CurrencyContext.Provider value={{ currency, setCurrency }}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("Wrap your app in <CurrencyProvider> in main.jsx");
  return ctx;
}

export const inrText = (v, d = 0) =>
  "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

export const usdText = (v) =>
  "$" + (v / USD_RATE).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Plain-text version for places where a <Money/> tag can't go (buttons, SVG text)
export function formatMoney(value, currency, decimals = 0) {
  const sign = value < 0 ? "-" : "";
  const v = Math.abs(value);
  if (currency === "usd") return sign + usdText(v);
  if (currency === "both") return `${sign}${inrText(v, decimals)} / ${sign}${usdText(v)}`;
  return sign + inrText(v, decimals);
}

export function useMoney() {
  const { currency } = useCurrency();
  return {
    currency,
    fmt: (v, d = 0) => formatMoney(v, currency, d),
    // one currency only, for tight spaces like chart axes
    fmtShort: (v, d = 0) => formatMoney(v, currency === "usd" ? "usd" : "inr", d),
  };
}