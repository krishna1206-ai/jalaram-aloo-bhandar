import "./Money.css";
import { useCurrency, inrText, usdText, USD_RATE } from "../CurrencyContext";

export { USD_RATE };

// One Money component for the whole site. Follows the ₹ / $ / both switch.
export default function Money({ value = 0, decimals = 0, signed = false, hide = false, currency }) {
  const ctx = useCurrency();
  const cur = currency || ctx.currency;

  if (hide) {
    return (
      <span className="m">
        <span className="m-main">••••</span>
      </span>
    );
  }

  const sign = value > 0 && signed ? "+" : value < 0 ? "-" : "";
  const v = Math.abs(value);

  return (
    <span className="m">
      <span className="m-main">
        {sign}
        {cur === "usd" ? usdText(v) : inrText(v, decimals)}
      </span>
      {cur === "both" && (
        <span className="m-sub">
          {sign}
          {usdText(v)}
        </span>
      )}
    </span>
  );
}