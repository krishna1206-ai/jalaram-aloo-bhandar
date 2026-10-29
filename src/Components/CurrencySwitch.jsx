import "./Navbar.css";
import { useCurrency, USD_RATE } from "../CurrencyContext";

const options = [
  { value: "inr", symbol: "₹", label: " INR" },
  { value: "usd", symbol: "$", label: " USD" },
  { value: "both", symbol: "₹ / $", label: " " },
];

export default function CurrencySwitch() {
  const { currency, setCurrency } = useCurrency();
  return (
    <div className="cs" role="group" aria-label="Display currency" title={`1 USD = ₹${USD_RATE}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={currency === o.value ? "on" : ""}
          aria-pressed={currency === o.value}
          onClick={() => setCurrency(o.value)}
        >
          {o.symbol}
          <span className="full">{o.label}</span>
        </button>
      ))}
    </div>
  );
}