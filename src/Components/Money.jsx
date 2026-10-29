// React version of the Angular <app-money> component.
// currency: "inr" | "usd" | "both"
export const USD_RATE = 95.27; // 1 USD = ₹95.27

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Money({ value = 0, currency = "inr" }) {
  const rupees = Number(value) || 0;
  const dollars = rupees / USD_RATE;

  if (currency === "usd") {
    return (
      <span className="m">
        <span className="m-main">{usd.format(dollars)}</span>
      </span>
    );
  }

  return (
    <span className="m">
      <span className="m-main">{inr.format(rupees)}</span>
      {currency === "both" && <span className="m-sub"> / {usd.format(dollars)}</span>}
    </span>
  );
}