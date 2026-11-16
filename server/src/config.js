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
};

if (isProd) {
  const missing = [];
  if (!config.mongoUri) missing.push("MONGODB_URI");
  if (!config.jwtSecret || config.jwtSecret.length < 32) missing.push("JWT_SECRET (32+ characters)");
  if (!config.adminUsername) missing.push("ADMIN_USERNAME");
  if (!config.adminPassword || config.adminPassword.length < 10) missing.push("ADMIN_PASSWORD (10+ characters)");
  if (missing.length) {
    throw new Error(`Missing or weak production settings: ${missing.join(", ")}. See server/.env.example.`);
  }
}
