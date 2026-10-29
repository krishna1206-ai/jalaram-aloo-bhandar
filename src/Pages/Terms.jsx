import { Link } from "react-router-dom";
import "./Terms.css";

const version = "1.0";
const lastUpdated = "27 October 2026";

const sections = [
  { id: "about", title: "About these terms" },
  { id: "platform", title: "What the platform does" },
  { id: "eligibility", title: "Who can open an account" },
  { id: "kyc", title: "Account opening and KYC" },
  { id: "security", title: "Keeping your account safe" },
  { id: "wallet", title: "Mandi wallet: adding and withdrawing money" },
  { id: "trading", title: "Prices, orders and trades" },
  { id: "godown", title: "Godown storage and your holdings" },
  { id: "fees", title: "Fees and charges" },
  { id: "currency", title: "Currency display (INR and USD)" },
  { id: "risk", title: "Risk disclosure" },
  { id: "tax", title: "Taxes" },
  { id: "prohibited", title: "What you must not do" },
  { id: "nominee", title: "Nominee and transmission" },
  { id: "closure", title: "Suspension and closing your account" },
  { id: "communication", title: "Messages we send you" },
  { id: "privacy", title: "Your data and privacy" },
  { id: "liability", title: "Limits of our liability" },
  { id: "changes", title: "Changes to these terms" },
  { id: "grievance", title: "Complaints and grievances" },
  { id: "law", title: "Governing law and disputes" },
];

function Terms() {
  const goTo = (id, e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="t-page">
      <header className="t-top">
        <Link className="t-brand" to="/">
          <span className="brand-mark">JA</span>
          <span className="t-brand-text">
            <strong>Jalaram Aloo Bhandar</strong>
            <small>COMMODITY MARKET</small>
          </span>
        </Link>
        <button type="button" className="t-print" onClick={() => window.print()}>
          Print / Save PDF
        </button>
      </header>

      <section className="t-hero">
        <span className="kicker">LEGAL</span>
        <h1>Terms and Conditions</h1>
        <p>Version {version} · Last updated {lastUpdated}</p>
      </section>

      <div className="t-layout">
        <nav className="t-toc" aria-label="Contents">
          <strong>Contents</strong>
          <ol>
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} onClick={(e) => goTo(s.id, e)}>
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="t-body">
          <aside className="t-checklist">
            <h2>Before you start: things to take care of</h2>
            <p>The full terms are below. These are the points that matter most for you, today and in future.</p>
            <ul>
              <li><b>Never share your password, 6-digit transaction PIN or OTP</b> with anyone, including people who say they are from Jalaram Aloo Bhandar. We will never ask for them.</li>
              <li><b>Keep your KYC details up to date.</b> Tell us within 30 days if your mobile number, email, address, bank account or tax residency changes.</li>
              <li><b>Add and withdraw money only through your own bank account and UPI ID.</b> Payments from or to anyone else will be refused or sent back.</li>
              <li><b>Check the rate, quantity and charges before you confirm</b> any buy or sell with your PIN. A confirmed trade cannot be undone.</li>
              <li><b>Produce is perishable.</b> Watch your storage period, storage charges and quality updates for the bags you hold in the godown.</li>
              <li><b>Prices can fall as well as rise.</b> Only invest money you can afford to lose and do not borrow to trade.</li>
              <li><b>Check your passbook and statements regularly</b> and report anything you do not recognise within 7 days.</li>
              <li><b>Keep your nominee details current</b> so your family can claim your balance and holdings if something happens to you.</li>
              <li><b>Keep records for your income tax return.</b> Download your statements at the end of every financial year.</li>
              <li><b>Log out on shared devices</b> and keep two-step verification turned on.</li>
            </ul>
          </aside>

          <section id="about">
            <h2>1. About these terms</h2>
            <p>These Terms and Conditions ("Terms") are an agreement between you and Jalaram Aloo Bhandar ("we", "us", "our"). They apply when you open an account, use our website or app, add money to your Mandi wallet, buy, sell or store produce, or use any other service we offer (together, the "Platform").</p>
            <p>By ticking "I agree to the terms and conditions" and submitting your application, you confirm that you have read, understood and accepted these Terms, our Privacy Policy and the Risk Disclosure in section 11. If you do not agree, please do not open an account.</p>
            <p>Some services may have extra terms that we show to you before you use them. If they conflict with these Terms, the extra terms apply to that service.</p>
          </section>

          <section id="platform">
            <h2>2. What the platform does</h2>
            <p>The Platform lets you buy, hold and sell physical agricultural produce, currently potatoes, onions and garlic, in standard bags (for example 20 kg bags of potato and onion, and 5 kg bags of garlic). Bags you buy are kept for you in godowns run by us or our storage partners until you sell them or ask for delivery.</p>
            <ul>
              <li>Every trade is a purchase or sale of real, physical produce. It is not a share, security, derivative, futures contract or deposit.</li>
              <li>The Platform does not give investment, tax or legal advice. Rates, charts and market information are for your information only.</li>
              <li>We may add or remove commodities, bag sizes, mandis and features from time to time.</li>
            </ul>
          </section>

          <section id="eligibility">
            <h2>3. Who can open an account</h2>
            <p>You can open an account only if you:</p>
            <ul>
              <li>are at least 18 years old and legally able to enter into a contract under Indian law;</li>
              <li>are a resident of India for tax purposes and hold a valid PAN;</li>
              <li>have a savings or current bank account in your own name with an Indian bank;</li>
              <li>are opening the account for yourself, not on behalf of anyone else; and</li>
              <li>have not had an account with us closed for misuse or fraud.</li>
            </ul>
            <p>Each person may hold only one account. You must tell us truthfully whether you are, or are related to, a politically exposed person (PEP). We may accept or refuse any application at our discretion.</p>
          </section>

          <section id="kyc">
            <h2>4. Account opening and KYC</h2>
            <ul>
              <li>We verify your mobile number and email with a one-time password (OTP), and your identity, address and bank account through KYC checks as required by law, including anti-money-laundering rules.</li>
              <li>Your name must match the name on your PAN. Payouts go only to a bank account held in that same name.</li>
              <li>The documents you upload must be genuine, clear and your own. Giving false or misleading information can lead to your account being closed and reported to the authorities.</li>
              <li>We may ask you to complete KYC again (re-KYC) at any time, for example when rules change or your details look outdated. Some services may be paused until it is done.</li>
              <li>You must update us within 30 days if any of your details change, including mobile, email, address, bank account, occupation, income range, PEP status or tax residency.</li>
            </ul>
          </section>

          <section id="security">
            <h2>5. Keeping your account safe</h2>
            <ul>
              <li>You are responsible for everything done using your login, password and transaction PIN. Your 6-digit PIN is needed to confirm every buy, sell and withdrawal.</li>
              <li>Choose a strong password that you do not use anywhere else. Do not write down or share your password, PIN or OTP.</li>
              <li>Keep two-step verification turned on. Lock your phone and keep its operating system and our app up to date.</li>
              <li>We will never ask for your password, PIN, OTP, card CVV or UPI PIN by phone, SMS, WhatsApp, email or social media. Treat anyone who asks as a fraudster.</li>
              <li>For your safety we may log you out after a period of inactivity, block repeated wrong OTP or PIN attempts, and ask for extra checks on unusual activity.</li>
              <li>If you think someone else knows your details or has used your account, change your password and PIN straight away and contact us immediately (see section 20). You are responsible for losses caused before you tell us, unless they were caused by our fault.</li>
            </ul>
          </section>

          <section id="wallet">
            <h2>6. Mandi wallet: adding and withdrawing money</h2>
            <p>Your Mandi wallet holds the money you use to buy produce and receives the money from your sales. The wallet always works in Indian rupees (INR) and Americal dollars (USD).</p>
            <h3>Adding money</h3>
            <ul>
              <li>You can add money by UPI (for example Google Pay, PhonePe or BHIM), debit card, credit card or bank transfer (NEFT, RTGS or IMPS), from accounts and cards in your own name only.</li>
              <li>Each top-up must be at least ₹1000/$10.51 and not more than ₹2,00,000/$2103.25. We may set other daily or monthly limits.</li>
              <li>UPI and card payments are added once your bank confirms them. Bank transfers are added only after the money reaches us and the UTR or reference number you give matches the transfer.</li>
              <li>Your card issuer may treat a credit card top-up as a cash advance or wallet load and charge you fees or interest. These are between you and your card issuer.</li>
              <li>We do not store your full card number or CVV. Card payments are handled by our payment partners.</li>
              <li>Money received from a third party's account will be returned to the source and may not be credited.</li>
            </ul>
            <h3>Using and holding money</h3>
            <ul>
              <li>Money set aside for your open orders is shown as "On hold" and cannot be used or withdrawn until the order is completed or cancelled.</li>
              <li>The wallet is not a bank account or deposit. It does not earn interest and is not covered by deposit insurance.</li>
            </ul>
            <h3>Withdrawing money</h3>
            <ul>
              <li>You can withdraw your available balance only to your registered bank account. Withdrawals normally reach your bank within 1 business day, but may take longer because of bank holidays, checks or system issues.</li>
              <li>Each withdrawal needs your transaction PIN. We may hold a withdrawal while we complete security or legal checks.</li>
              <li>If a payment or withdrawal fails, the money will be returned to your wallet or to the original payment source.</li>
            </ul>
          </section>

          <section id="trading">
            <h2>7. Prices, orders and trades</h2>
            <ul>
              <li>Rates shown on the Platform are based on mandi prices and supply and can change at any moment, including between the time you see a rate and the time your order is completed.</li>
              <li>An order is final only when it is completed and appears in your passbook as "Completed". You must confirm every order with your PIN. Completed trades cannot be cancelled or reversed by you.</li>
              <li>Please check the commodity, number of bags, rate and charges carefully before confirming.</li>
              <li>We may refuse, cancel or reverse an order if the rate was clearly wrong because of a technical error, if there is not enough stock, if the order seems fraudulent, or if the law requires it. If we do, any money taken will be returned to your wallet.</li>
              <li>Quality grades, bag weights and packing follow the standard described on the Platform for each commodity. Small natural variations in weight and size are normal for fresh produce.</li>
              <li>We may limit how much you can buy or hold, for example to follow government stock limits.</li>
            </ul>
          </section>

          <section id="godown">
            <h2>8. Godown storage and your holdings</h2>
            <ul>
              <li>Bags you buy are kept for you in a godown or cold store run by us or our partners. "My Godown" shows the number of bags you hold, their average buying price and their value at the current rate.</li>
              <li><b>Produce is perishable.</b> Over time it can lose weight, sprout, soften or spoil even when stored properly. We will store it with reasonable care, but some natural loss is expected and is not our fault.</li>
              <li>Each commodity has a maximum storage period, shown on the Platform. Before it ends we will remind you to sell or ask for delivery. If you do neither, we may sell your bags at the market rate and credit the money, minus charges, to your wallet.</li>
              <li>Storage charges may apply for each bag for each day, week or month it is stored. Charges are shown on the Platform and in your statements.</li>
              <li>You can ask for your bags to be delivered or picked up where this is offered. Delivery charges, minimum quantities and the delivery area will be shown before you confirm.</li>
              <li>If produce is lost or damaged because of our negligence, our liability is limited to the market value of the affected bags on the day the loss is found.</li>
            </ul>
          </section>

          <section id="fees">
            <h2>9. Fees and charges</h2>
            <p>Depending on what you use, charges may include brokerage or platform fees on each trade, storage charges, delivery and handling charges, and payment gateway fees. Taxes such as GST are added as applicable.</p>
            <ul>
              <li>Charges that apply to a trade or payment are shown to you before you confirm it, and appear in your passbook as "Charges".</li>
              <li>Our current fee schedule is available on the Platform. We will tell you at least 15 days before we increase any fee.</li>
              <li>We may take charges you owe from your wallet balance or from the money you receive when you sell.</li>
            </ul>
          </section>

          <section id="currency">
            <h2>10. Currency display (INR and USD)</h2>
            <p>You can choose to see amounts in INR, USD or both. USD amounts are approximate conversions at an indicative exchange rate, shown only for your convenience. All payments, trades, charges, withdrawals and statements are in INR only, and the rupee amount is the one that counts. You cannot pay, hold or withdraw in USD.</p>
          </section>

          <section id="risk">
            <h2>11. Risk disclosure</h2>
            <p>Please read this carefully. Buying and holding produce carries real risk.</p>
            <ul>
              <li>Prices can fall as well as rise. You may lose part or all of the money you put in.</li>
              <li>Prices change with harvests, weather, seasons, transport, storage costs, imports and exports, and government actions such as stock limits, export restrictions or price controls.</li>
              <li>Past prices and trends shown on the Platform do not tell you what will happen in future.</li>
              <li>At some times there may be few buyers, and you may not be able to sell quickly or at the rate you want.</li>
              <li>Storage losses and charges reduce your returns, especially if you hold produce for a long time.</li>
              <li>Only use money you can afford to lose. Do not borrow money to trade. If you are unsure, speak to an independent financial adviser.</li>
            </ul>
          </section>

          <section id="tax">
            <h2>12. Taxes</h2>
            <p>You are responsible for reporting any income or gains from your trades and paying any taxes due. We may deduct tax at source (TDS) or collect tax where the law requires, and we will show it in your statements. Download your statements at the end of each financial year and keep them for your records.</p>
          </section>

          <section id="prohibited">
            <h2>13. What you must not do</h2>
            <ul>
              <li>Use another person's account, bank account, card or UPI ID, or let anyone else use yours.</li>
              <li>Use the Platform for money laundering, funding illegal activity, tax evasion or any other unlawful purpose.</li>
              <li>Try to manipulate prices, place fake orders or work with others to mislead the market.</li>
              <li>Use bots, scrapers or automated tools, or try to hack, overload or reverse-engineer the Platform.</li>
              <li>Give false information or upload forged documents.</li>
            </ul>
            <p>If you do, we may cancel orders, freeze your wallet and holdings, close your account and report the matter to the authorities.</p>
          </section>

          <section id="nominee">
            <h2>14. Nominee and transmission</h2>
            <p>You may name a nominee to receive your wallet balance and holdings if you die. You can change your nominee at any time from your profile. When we are told of a death, we will hand over the balance and holdings to the nominee, or to the legal heirs where there is no valid nominee, after receiving the documents we reasonably need.Nominee's age must be over 18.</p>
          </section>

          <section id="closure">
            <h2>15. Suspension and closing your account</h2>
            <ul>
              <li>You can close your account at any time after you sell or take delivery of your holdings, clear any charges you owe and withdraw your balance.</li>
              <li>We may limit, suspend or close your account, with notice where the law allows, if KYC is not completed, we suspect fraud or misuse, you break these Terms, or a court, regulator or other authority tells us to.</li>
              <li>If your account is closed, we will return your available balance to your registered bank account and either deliver or sell your holdings, after taking off any charges due, unless the law stops us.</li>
              <li>If you do not log in for a long time, we may mark your account as inactive and ask you to complete checks before you use it again.</li>
            </ul>
          </section>

          <section id="communication">
            <h2>16. Messages we send you</h2>
            <p>We will send you service messages about your account, OTPs, orders, payments, storage reminders and changes to these Terms by SMS, WhatsApp, email or in the app. You cannot turn these off while your account is open. Price alerts and offers are sent only if you choose to receive them, and you can stop them at any time from your profile. Keep your mobile number and email current so you do not miss important messages.</p>
          </section>

          <section id="privacy">
            <h2>17. Your data and privacy</h2>
            <p>We collect and use your personal and KYC data to open and run your account, verify your identity, process payments, prevent fraud and follow the law, as explained in our Privacy Policy. We share it only with partners who help us provide the service (such as KYC agencies, banks, payment partners and storage partners) and with authorities when the law requires. We keep KYC records for as long as the law requires, which may be several years after your account is closed. You can ask to see or correct your data by contacting us.</p>
          </section>

          <section id="liability">
            <h2>18. Limits of our liability</h2>
            <ul>
              <li>We aim to keep the Platform available and accurate, but we do not promise that it will always be available, error-free or uninterrupted. Maintenance, network problems or outages at banks and payment partners may cause delays.</li>
              <li>We are not responsible for losses caused by market price movements, your own decisions, your sharing of login details, or events beyond our reasonable control such as natural disasters, floods, fire, strikes, pandemics, government orders or failures of power or networks.</li>
              <li>Where we are responsible, our total liability is limited to the direct loss you suffer, and never more than the fees you paid us in the 12 months before the event. Nothing in these Terms limits any liability that cannot be limited under Indian law.</li>
            </ul>
          </section>

          <section id="changes">
            <h2>19. Changes to these terms</h2>
            <p>We may update these Terms to reflect changes in the law, our services or our fees. We will tell you about important changes at least 15 days before they take effect, by message or in the app. If you keep using the Platform after that date, you accept the updated Terms. If you do not agree, you may close your account as described in section 15. The version and date at the top of this page show when these Terms were last changed.</p>
          </section>

          <section id="grievance">
            <h2>20. Complaints and grievances</h2>
            <p>If something has gone wrong, please tell us. We will acknowledge your complaint within 2 business days and aim to resolve it within 15 business days.</p>
            <dl className="t-contact">
              <div><dt>Customer support</dt><dd>[support email] · [support phone number]</dd></div>
              <div><dt>Grievance officer</dt><dd>[name], [email], [phone number]</dd></div>
              <div><dt>Registered address</dt><dd>[registered office address]</dd></div>
            </dl>
            <p>To report fraud or a lost device, contact us immediately so we can block your account. You can also report cyber fraud on the national helpline 1930 or at cybercrime.gov.in.</p>
          </section>

          <section id="law">
            <h2>21. Governing law and disputes</h2>
            <p>These Terms are governed by the laws of India. We will first try to settle any dispute with you through our grievance process. If it cannot be settled, the courts at [city] will have jurisdiction.</p>
          </section>

          <p className="t-end">
            By ticking the box on the registration form you confirm that you have read and agree to these Terms and Conditions.
          </p>
        </article>
      </div>

      <footer className="t-foot">
        © 2026 Jalaram Aloo Bhandar · <Link to="/">Home</Link> · <Link to="/register">Open an account</Link>
      </footer>
    </div>
  );
}

export default Terms;