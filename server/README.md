# Jalaram Aloo Bhandar — API

Express 5 + MongoDB (Mongoose) backend for the React app in the folder above.

## Run it locally

```bash
cd server
npm install
npm run dev          # API on http://localhost:5000/api
```

Then start the frontend in another terminal from the project root with `npm run dev`. Vite forwards `/api` to port 5000.

If `MONGODB_URI` is not set, the server starts a **temporary in-memory MongoDB** and loads demo data. Everything is lost when the server stops. To keep data, create `server/.env` from `.env.example` and set `MONGODB_URI` (for example a free MongoDB Atlas cluster).

| Demo login | |
|---|---|
| User | `test@gmail.com` / `123456`, transaction PIN `123456` |
| Other demo users | e.g. `meena.shah@example.com` / `Demo@1234` |
| Admin (`/admin/login`) | `admin` / `admin@123` (dev only, set your own in production) |
| Sign-up OTP (dev mode) | `123456` |

Tests: `npm test` runs the end-to-end tests against an in-memory database.

## How money works

- Balances are stored as whole **paise** (integers), and the API returns rupees.
- **Deposits** (UPI or bank transfer) create a *pending* request. An admin approves it once the money has arrived, and only then is the wallet credited. Card payments are refused until a payment gateway is added.
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
| `POST /api/auth/login` | public | `{identifier, password}` (email or mobile) |
| `POST /api/auth/admin/login` | public | `{username, password}` |
| `GET /api/me` | user | Profile (masked) + wallet |
| `GET /api/me/holdings` · `/transactions` · `/orders` | user | Godown, passbook, orders |
| `POST /api/me/orders` | user | `{side, product, city, bags, pin}` |
| `POST /api/me/wallet/deposits` | user | `{amount, method, upiApp, upiId, utr}` |
| `POST /api/me/wallet/withdrawals` | user | `{amount, pin}` |
| `GET /api/admin/overview` | admin | Users, wallet requests, orders, rates |
| `GET /api/admin/users/:clientId` | admin | Full KYC details |
| `GET /api/admin/users/:clientId/documents/:key` | admin | A KYC file |
| `PATCH /api/admin/users/:clientId` | admin | `{kyc, blocked}` |
| `POST /api/admin/wallet-requests/:id/decision` | admin | `{approve: true\|false}` |
| `PUT /api/admin/rates/:product/:city` | admin | `{today, low, high, arrivals}` |
| `POST /api/admin/reset-demo` | admin | Only when `SEED_DEMO=true` |

Errors always look like `{ "error": "message", "fields": { "pan": "..." } }`.

## Deploying

1. **Database:** create a MongoDB Atlas cluster and copy its connection string.
2. **API:** deploy the `server/` folder to Render, Railway or a VPS. Build command `npm install`, start command `npm start`. Set the following:
   - `NODE_ENV=production`
   - `MONGODB_URI`
   - `JWT_SECRET` (48+ random characters)
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD`
   - `CORS_ORIGIN=https://your-site.vercel.app`
3. **Frontend (Vercel):** set `VITE_API_URL=https://your-api.onrender.com` and redeploy.

In production, demo data and dev OTPs are **off**. The server refuses to start without the required settings.

## Before real users and real money

- **OTP delivery:** connect an SMS and email provider in `src/services/otp.js` (`deliver()`), then set `OTP_DEV_MODE=false`.
- **Payments:** add a payment gateway (e.g. Razorpay) for UPI and cards, with webhook confirmation, instead of manual approval.
- **Bank verification:** the "Verify bank account" button on sign-up is still a placeholder. It needs a penny-drop API.
- **Encryption:** bank account numbers and PAN are stored as plain text in MongoDB. Use encryption at rest (Atlas encryption, or field-level encryption) and restrict database access.
- **Not built yet:** password and PIN reset, and a Sell button in the UI (the API already supports `side: "Sell"`).
- **Compliance:** commodity trading and holding customer money are regulated. Get legal advice for your setup.
