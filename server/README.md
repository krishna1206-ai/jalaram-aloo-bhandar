# Jalaram Aloo Bhandar — API

Express 5 + MongoDB (Mongoose) backend for the React app in the folder above.

## Run it locally

```bash
cd server
npm install
npm run dev          # API on http://localhost:5000/api
```

Then start the frontend in another terminal from the project root with `npm run dev`. Vite forwards `/api` to port 5000.

If `MONGODB_URI` is not set, the server starts a **local MongoDB that saves its data in `server/.data/db`**, so your data stays after a restart. On the very first start it loads the demo data. To start again with fresh demo data, use **Reset demo data** in the admin panel, or stop the server and delete the `server/.data` folder. For the online site, set `MONGODB_URI` to a MongoDB Atlas connection string instead.

| Demo login | |
|---|---|
| User | `test@gmail.com` / `123456`, transaction PIN `123456` |
| Other demo users | e.g. `meena.shah@example.com` / `Demo@1234` |
| Admin (`/admin/login`) | `admin` / `admin@123` (dev only, set your own in production) |
| Sign-up OTP (dev mode) | `123456` |

Tests: `npm test` runs the end-to-end tests against an in-memory database.

## How money works

- Balances are stored as whole **paise** (integers), and the API returns rupees.
- **Online deposits (Razorpay):** UPI, cards and net banking happen in Razorpay's window. The wallet is credited after the server checks the payment signature and confirms with Razorpay that the money was captured. The webhook covers payments the browser never reported back, and a payment can only ever be credited once.
- **Manual deposits** (UPI to your UPI ID, or bank transfer with a UTR) create a *pending* request. An admin approves it once the money has arrived.
- **Withdrawals** need the PIN and move the money from *available* to *on hold*. When an admin approves, the money is paid out. When an admin rejects, it goes back to available.
- **Orders** fill at the server's current mandi rate, never at a price sent by the browser. The charges are 0.5% brokerage, a ₹10 platform fee and 18% GST on charges. Wallet, holding, order and passbook writes happen in one MongoDB transaction with a conditional balance check, so parallel orders can't overdraw the wallet.
- Five wrong PINs lock the PIN for 15 minutes.

## API

| Method & path | Who | What |
|---|---|---|
| `GET /api/health` | public | Status |
| `GET /api/market/catalog` | public | Products, cities, charges |
| `GET /api/market/rates?city=&product=` | public | Today's rates with a 7-day trend |
| `GET /api/market/history?city=&product=` | public | ~1 year of daily candles |
| `GET /api/market/summary` | public | Average per product (home page) |
| `POST /api/auth/otp/send` / `verify` | public | `{channel: "mobile"\|"email", target, code}` |
| `POST /api/auth/register` | public | Multipart: form fields + `panCard`, `aadhaarFront`, `selfie`, `signature`, `cheque` |
| `GET /api/config` | public | Payments on/off, Razorpay key ID, collection account |
| `GET /api/auth/ifsc/:code` | public | Bank and branch for an IFSC code |
| `POST /api/auth/login` | public | `{identifier, password}`. With two-step login it returns `{twoFactor, challenge}` |
| `POST /api/auth/login/verify` | public | `{challenge, code}` |
| `POST /api/auth/password/forgot` / `reset` | public | OTP to the registered mobile, then `{identifier, code, password}` |
| `POST /api/auth/admin/login` | public | `{username, password}` |
| `GET /api/me` | user | Profile (masked) + wallet |
| `GET /api/me/holdings` · `/transactions` · `/orders` | user | Godown, passbook, orders |
| `POST /api/me/orders` | user | `{side, product, city, bags, pin}` |
| `POST /api/me/wallet/deposits` | user | `{amount, method, upiApp, upiId, utr}` |
| `POST /api/me/wallet/withdrawals` | user | `{amount, pin}` |
| `POST /api/me/wallet/payments` · `/verify` | user | Razorpay order, then `{orderId, paymentId, signature}` |
| `PATCH /api/me/settings` | user | `{marketing}`, or `{twoFactor, password}` |
| `POST /api/me/password` | user | `{currentPassword, newPassword}`. Signs out other devices |
| `POST /api/me/pin/otp` · `POST /api/me/pin` | user | OTP, then `{password, code, pin}` |
| `POST /api/me/logout-all` | user | Signs out every device |
| `POST /api/me/kyc/documents` | user | Multipart re-upload while KYC is pending or rejected |
| `POST /api/webhooks/razorpay` | Razorpay | Signed webhook (`payment.captured`, `payment.failed`) |
| `GET /api/admin/overview` | admin | Users, wallet requests, orders, rates |
| `GET /api/admin/users/:clientId` | admin | Full KYC details |
| `GET /api/admin/users/:clientId/documents/:key` | admin | A KYC file |
| `PATCH /api/admin/users/:clientId` | admin | `{kyc, note, blocked}` (rejecting needs a `note`) |
| `GET /api/admin/audit` | admin | Log of every admin action |
| `POST /api/admin/password` | admin | `{currentPassword, newPassword}` |
| `POST /api/admin/wallet-requests/:id/decision` | admin | `{approve: true\|false}` |
| `PUT /api/admin/rates/:product/:city` | admin | `{today, low, high, arrivals}` |
| `POST /api/admin/reset-demo` | admin | Only when `SEED_DEMO=true` |

Errors always look like `{ "error": "message", "fields": { "pan": "..." } }`.

## Security built in

- Passwords and PINs are hashed with bcrypt. Five wrong PINs lock the PIN for 15 minutes.
- PAN and bank account numbers are encrypted in the database with AES-256-GCM (`DATA_KEY`). A keyed hash catches duplicate PANs without decrypting. Only admins see the full numbers.
- Changing or resetting a password, or "log out on all devices", invalidates every older login token.
- Two-step login (an OTP to the mobile number) can be switched on by each user in Profile & security.
- The server checks KYC files by their actual bytes, not by what the browser says they are.
- Rate limits cover login, OTP, sign-up and password/PIN changes.
- Every admin change to money, KYC, users or rates is written to the audit log.

## Deploying

1. **Database:** create a MongoDB Atlas cluster and copy its connection string.
2. **API:** in Render, choose **New → Blueprint** and pick this repo. [render.yaml](../render.yaml) sets it up. Fill in the values it asks for (see [.env.example](.env.example)). On other hosts, deploy `server/` with `npm ci --omit=dev` and `npm start`.
3. **Frontend (Vercel):** set `VITE_API_URL=https://your-api.onrender.com` and redeploy. Put that same Vercel URL in the API's `CORS_ORIGIN`.
4. **Razorpay:** add the webhook `https://your-api.onrender.com/api/webhooks/razorpay` with the events `payment.captured` and `payment.failed`.

In production, demo data and dev OTPs are **off**. The server refuses to start if any required setting is missing.

## Your accounts to set up before going live

- **SMS:** an MSG91 account with a DLT-approved OTP template, or Twilio.
- **Email:** any SMTP service.
- **Payments:** a Razorpay account with KYC done. Test it first with `rzp_test_` keys.
- **Compliance:** commodity trading and holding customer money are regulated. Get legal advice for your setup.
- **Not covered:** checking that a bank account belongs to the user (penny drop) needs a paid service such as RazorpayX or Cashfree. Until then, admins check the cancelled cheque during KYC review. Storage charges are not charged automatically.
