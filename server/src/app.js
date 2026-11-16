import cors from "cors";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import { config } from "./config.js";
import { errorHandler, notFound } from "./errors.js";
import adminRoutes from "./routes/admin.js";
import authRoutes from "./routes/auth.js";
import marketRoutes from "./routes/market.js";
import meRoutes from "./routes/me.js";
import { emailEnabled, smsEnabled } from "./services/notify.js";
import { handleWebhook } from "./services/payments.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(cors({ origin: config.corsOrigins, maxAge: 600 }));

  // Razorpay signs the exact bytes it sends, so this route needs the raw body (before express.json)
  app.post("/api/webhooks/razorpay", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
    await handleWebhook(req.body.toString("utf8"), req.get("x-razorpay-signature"));
    res.json({ ok: true });
  });

  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? "connected" : "down" });
  });

  // What the frontend needs to know about this server's setup
  app.get("/api/config", (req, res) => {
    res.json({
      appName: config.appName,
      razorpayKeyId: config.razorpay.enabled ? config.razorpay.keyId : null,
      otpDevMode: config.otpDevMode,
      otpChannels: { email: config.otpDevMode || emailEnabled(), mobile: config.otpDevMode || smsEnabled() },
      collectAccount: config.collectAccount,
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/market", marketRoutes);
  app.use("/api/me", meRoutes);
  app.use("/api/admin", adminRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
