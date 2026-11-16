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

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(cors({ origin: config.corsOrigins, maxAge: 600 }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? "connected" : "down" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/market", marketRoutes);
  app.use("/api/me", meRoutes);
  app.use("/api/admin", adminRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
