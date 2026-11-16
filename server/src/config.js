import dotenv from "dotenv";

dotenv.config({ quiet: true });

const env = process.env;
const isProd = env.NODE_ENV === "production";
const isTest = env.NODE_ENV === "test";
const flag = (value, fallback) => (value === undefined || value === "" ? fallback : value === "true");

export const config = {
  isProd,
  isTest,
  port: Number(env.PORT) || 5000,

  // Leave empty in development to use a temporary in-memory database.
  mongoUri: env.MONGODB_URI || "",

  jwtSecret: env.JWT_SECRET || (isProd ? "" : "dev-only-secret-do-not-use-in-production"),
  userTokenTtl: env.USER_TOKEN_TTL || "7d",
  adminTokenTtl: env.ADMIN_TOKEN_TTL || "12h",

  // Comma-separated list of frontend URLs allowed to call the API.
  corsOrigins: (env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Number of proxies in front of the app (Render, Railway, Nginx = 1). Needed for correct client IPs.
  trustProxy: Number(env.TRUST_PROXY ?? (isProd ? 1 : 0)),

  adminUsername: env.ADMIN_USERNAME || (isProd ? "" : "admin"),
  adminPassword: env.ADMIN_PASSWORD || (isProd ? "" : "admin@123"),

  // Demo users, orders and the "Reset demo data" button. Off by default in production.
  seedDemo: flag(env.SEED_DEMO, !isProd),

  // Dev OTP mode: the code is always 123456 and nothing is sent. Must be off in production.
  otpDevMode: flag(env.OTP_DEV_MODE, !isProd),

  appName: env.APP_NAME || "Jalaram Aloo Bhandar",

  // 64 hex characters (32 bytes). Encrypts PAN and bank account numbers in the database.
  // Never change it after real data exists, or that data can't be read any more.
  dataKey: env.DATA_KEY || "",

  // Email (any SMTP service: Gmail app password, Zoho, Amazon SES, Brevo, ...)
  smtp: {
    host: env.SMTP_HOST || "",
    port: Number(env.SMTP_PORT) || 587,
    user: env.SMTP_USER || "",
    pass: env.SMTP_PASS || "",
    from: env.SMTP_FROM || env.SMTP_USER || "",
  },

  // SMS: "msg91" or "twilio"
  sms: {
    provider: (env.SMS_PROVIDER || "").toLowerCase(),
    msg91AuthKey: env.MSG91_AUTH_KEY || "",
    msg91TemplateId: env.MSG91_TEMPLATE_ID || "",
    twilioSid: env.TWILIO_ACCOUNT_SID || "",
    twilioToken: env.TWILIO_AUTH_TOKEN || "",
    twilioFrom: env.TWILIO_FROM || "",
  },

  // Online payments. Leave empty to offer only manual UPI / bank transfer requests.
  razorpay: {
    keyId: env.RAZORPAY_KEY_ID || "",
    keySecret: env.RAZORPAY_KEY_SECRET || "",
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || "",
    apiBase: env.RAZORPAY_API_BASE || "https://api.razorpay.com/v1",
  },

  ifscApi: env.IFSC_API || "https://ifsc.razorpay.com",

  // Where users send manual bank transfers / UPI payments (shown on the Add money screen)
  collectAccount: {
    name: env.COLLECT_ACCOUNT_NAME || "Jalaram Aloo Bhandar Collections",
    number: env.COLLECT_ACCOUNT_NUMBER || "50200012345678",
    ifsc: env.COLLECT_ACCOUNT_IFSC || "HDFC0001234",
    bank: env.COLLECT_ACCOUNT_BANK || "HDFC Bank",
    upi: env.COLLECT_UPI_ID || "jalaramaloo@hdfcbank",
  },
};

config.razorpay.enabled = Boolean(config.razorpay.keyId && config.razorpay.keySecret);

if (isProd) {
  const missing = [];
  if (!config.mongoUri) missing.push("MONGODB_URI");
  if (!/^[0-9a-f]{64}$/i.test(config.dataKey)) missing.push("DATA_KEY (64 hex characters)");
  if (!env.COLLECT_ACCOUNT_NUMBER || !env.COLLECT_ACCOUNT_IFSC || !env.COLLECT_UPI_ID) {
    missing.push("COLLECT_ACCOUNT_NUMBER, COLLECT_ACCOUNT_IFSC and COLLECT_UPI_ID (your real collection account)");
  }
  if (!config.jwtSecret || config.jwtSecret.length < 32) missing.push("JWT_SECRET (32+ characters)");
  if (!config.adminUsername) missing.push("ADMIN_USERNAME");
  if (!config.adminPassword || config.adminPassword.length < 10) missing.push("ADMIN_PASSWORD (10+ characters)");
  if (missing.length) {
    throw new Error(`Missing or weak production settings: ${missing.join(", ")}. See server/.env.example.`);
  }
}
