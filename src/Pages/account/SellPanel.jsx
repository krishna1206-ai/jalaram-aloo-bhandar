import { useState } from "react";
import Money from "../../Components/Money";
import { api } from "../../api.js";

// Same formula as the server (server/src/money.js); the server's bill is the one that counts.
function sellQuote(rate, bags, charges) {
  const value = rate * bags;
  const brokerage = value * charges.brokerageRate;
  const gst = (brokerage + charges.platformFee) * charges.gstRate;
  const total = brokerage + charges.platformFee + gst;
  return { value, charges: total, proceeds: value - total };
}

// Sell bags from one godown holding at today's mandi rate
export default function SellPanel({ holding, charges, onClose, onSold }) {
  const [bags, setBags] = useState(holding.bags);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const q = sellQuote(holding.ltp, bags, charges);

  const setCount = (v) => {
    setBags(Math.min(holding.bags, Math.max(1, Math.floor(Number(v)) || 1)));
    setError("");
  };

  const sell = async () => {
    if (busy) return;
    if (!/^\d{6}$/.test(pin)) return setError("Enter your 6-digit transaction PIN.");
    if (q.proceeds <= 0) return setError("This order is too small to cover the charges.");
    setBusy(true);
    try {
      const res = await api("/me/orders", {
        method: "POST",
        body: { side: "Sell", product: holding.product, city: holding.city, bags, pin },
      });
      onSold(res, `Sold ${bags} ${bags === 1 ? "bag" : "bags"} of ${holding.name.toLowerCase()} in ${holding.city}.`);
    } catch (err) {
      setError(err.message);
      setPin("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="money-panel">
      <div className="panel-head">
        <h3>Sell {holding.name.toLowerCase()} · {holding.city}</h3>
        <button type="button" className="close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <p className="muted small">
        You hold {holding.bags} bags · today's rate <Money value={holding.ltp} /> per {holding.pack}
      </p>

      <label htmlFor="sell-bags">Bags to sell</label>
      <input id="sell-bags" type="number" min="1" max={holding.bags} value={bags} onChange={(e) => setCount(e.target.value)} />
      <div className="quick">
        {[1, 5, 10].filter((n) => n < holding.bags).map((n) => (
          <button key={n} type="button" className={bags === n ? "on" : ""} onClick={() => setCount(n)}>{n}</button>
        ))}
        <button type="button" className={bags === holding.bags ? "on" : ""} onClick={() => setCount(holding.bags)}>All ({holding.bags})</button>
      </div>

      <p className="muted small">
        Sale value <Money value={q.value} decimals={2} /> − charges <Money value={q.charges} decimals={2} /> ={" "}
        <strong><Money value={q.proceeds} decimals={2} /></strong> to your wallet
      </p>

      <label htmlFor="sell-pin">Transaction PIN</label>
      <input
        id="sell-pin"
        type="password"
        inputMode="numeric"
        maxLength={6}
        autoComplete="off"
        placeholder="••••••"
        value={pin}
        onChange={(e) => {
          setPin(e.target.value.replace(/\D/g, ""));
          setError("");
        }}
        onKeyDown={(e) => e.key === "Enter" && sell()}
      />

      {error && <span className="error">{error}</span>}
      <div className="panel-actions">
        <button type="button" className="btn solid" onClick={sell} disabled={busy}>
          {busy ? "Selling…" : "Sell now"}
        </button>
        <button type="button" className="btn outline" onClick={onClose}>Cancel</button>
      </div>
      <p className="muted small">A confirmed sale cannot be cancelled. Money is added to your wallet straight away.</p>
    </section>
  );
}
