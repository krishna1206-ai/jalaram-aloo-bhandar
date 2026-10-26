import potato from "../assets/images/potatoes.jpg";
import garlic from "../assets/images/garlic.jpg";
import onion from "../assets/images/onions.jpg";
import './Watchlist.css'
function Watchlist(){
    return(
        <>
            <section id="market-preview" className="watchlist">
                <div className="section-heading">
                    <div>
                        <span className="section-kicker">THE MARKET WATCHLIST</span>
                        <h2>Three essentials. One place.</h2>
                    </div>
                    <span class="sample-note">Illustrative prices · INR</span>
                </div>
                <div className="commodity-grid">
                    <article className="commodity-card">
                        <img src={potato} alt="fresh potato" />
                        <div className="commodity-name">
                            <strong>Potatoes</strong>
                            <small>Per 20 kg bag</small>
                        </div>
                        <div className="commodity-ptice">
                            <strong>₹420</strong>
                            <small class="up">↗ 2.4% today</small>
                        </div>
                    </article>
                      <article className="commodity-card">
                        <img src={garlic} alt="fresh potato" />
                        <div className="commodity-name">
                            <strong>Potatoes</strong>
                            <small>Per 20 kg bag</small>
                        </div>
                        <div className="commodity-ptice">
                            <strong>₹420</strong>
                            <small class="up">↗ 2.4% today</small>
                        </div>
                    </article>                   
                      <article className="commodity-card">
                        <img src={onion} alt="fresh potato" />
                        <div className="commodity-name">
                            <strong>Potatoes</strong>
                            <small>Per 20 kg bag</small>
                        </div>
                        <div className="commodity-ptice">
                            <strong>₹420</strong>
                            <small class="up">↗ 2.4% today</small>
                        </div>
                    </article>
                </div>
            </section>
        </>
    )
}
export default Watchlist;