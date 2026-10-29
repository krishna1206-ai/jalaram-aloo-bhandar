import "./Navbar.css";
import { useCurrency, USD_RATE } from "../CurrencyContext";

const options = [
  { value: "inr", symbol: "₹", label: " INR", title: "Show all prices in rupees" },
  { value: "usd", symbol: "$", label: " USD", title: `Show all prices in US dollars (1 USD = ₹${USD_RATE})` },
  { value: "both", symbol: "₹ / $", label: " ", title: "Show prices in both rupees and dollars" },
];

export default function CurrencySwitch() {
  const { currency, setCurrency } = useCurrency();

  return (
    <div className="cs" role="group" aria-label="Display currency">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
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