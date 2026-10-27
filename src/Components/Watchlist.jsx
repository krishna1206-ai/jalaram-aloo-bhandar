import potato from "../assets/images/potatoes.jpg";
import garlic from "../assets/images/garlic.jpg";
import onion from "../assets/images/onions.jpg";
import "./Watchlist.css";

const commodities = [
  { name: "Potatoes", image: potato, unit: "Per 20 kg bag", price: 420, change: 2.4 },
  { name: "Garlic", image: garlic, unit: "Per 5 kg bag", price: 680, change: -1.2 },
  { name: "Onions", image: onion, unit: "Per 20 kg bag", price: 560, change: 3.8 },
];

function Watchlist() {
  return (
    <section id="market-preview" className="watchlist">
      <div className="section-heading">
        <div>
          <span className="section-kicker">THE MARKET WATCHLIST</span>
          <h2>Three essentials. One place.</h2>
        </div>
        <span className="sample-note">Illustrative · Prices in INR</span>
      </div>

      <div className="commodity-grid">
        {commodities.map((item) => {
          const up = item.change >= 0;
          return (
            <article className="commodity-card" key={item.name}>
              <img src={item.image} alt={`Fresh ${item.name.toLowerCase()}`} />
              <div className="commodity-name">
                <strong>{item.name}</strong>
                <small>{item.unit}</small>
              </div>
              <div className="commodity-price">
                <strong>
                  <span className="m">
                    <span className="m-main">₹{item.price}</span>
                  </span>
                </strong>
                <small className={up ? "up" : "down"}>
                  {up ? "↗︎" : "↘︎"} {Math.abs(item.change)}% today
                </small>
              </div>
            </article>
          );
        })}
      </div>

      <p className="disclaimer">
        Demo welcome page. Prices shown are illustrative, not live rates or investment advice.
      </p>
    </section>
  );
}

export default Watchlist;