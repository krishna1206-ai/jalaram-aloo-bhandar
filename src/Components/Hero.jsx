import "./Hero.css";
import { Link } from "react-router-dom";
import mandiImage from "../assets/images/mandi-market.jpg";
function Hero(){
    return(
        <>
        <section className="hero hero-full-image">
            <div className="hero-copy">
                <div className="eyebrow">
                    <span className="status-dot"></span>
                    A SMARTER WAY TO TRACK PRICES
                </div>
                <h1> Grow with the <br /><span>daily market.</span></h1>
                <p className="intro">
                    Follow potato, garlic and onion prices in one place. Explore daily price movements and manage your market activity from a simple dashboard. 
                </p>
                <div className="hero-actions">
                    <Link to="/login" className="btn-primary">
    Start exploring <span>↗</span>
  </Link>
                </div>
                <div className="trust-row">
                    <span class="check">✓</span>
                    <span>Transparent prices</span>
                    <i></i>
                    <span>Simple wallet</span>
                    <i></i>
                    <span>Daily updates</span>
                </div>
            </div>
        </section>
        </>
    )
}

export default Hero;