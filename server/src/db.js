import mongoose from "mongoose";
import { config } from "./config.js";

let memoryServer = null;

export async function connectDb(uri = config.mongoUri) {
  if (!uri) {
    if (config.isProd) throw new Error("MONGODB_URI is required in production.");
    // Wallet and trade writes use transactions, which need a replica set, so start a one-node set.
    const { MongoMemoryReplSet } = await import("mongodb-memory-server");
    memoryServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    uri = memoryServer.getUri("jalaram");
    if (!config.isTest) {
      console.warn("⚠  No MONGODB_URI set: using a temporary in-memory MongoDB. All data is lost when the server stops.");
    }
  }
  await mongoose.connect(uri);
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

// Runs fn inside a MongoDB transaction and retries on transient write conflicts.
export function withTransaction(fn) {
  return mongoose.connection.transaction(fn);
}
