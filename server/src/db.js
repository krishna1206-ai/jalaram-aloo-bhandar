import { spawn } from "node:child_process";
import fs from "node:fs";
import mongoose from "mongoose";
import { config } from "./config.js";

let memoryServer = null;
let localMongod = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Local database saved on disk (development without MONGODB_URI) ---------- */

async function ping(url) {
  const client = new mongoose.mongo.MongoClient(url, { serverSelectionTimeoutMS: 800 });
  try {
    await client.connect();
    return client;
  } catch {
    await client.close().catch(() => {});
    return null;
  }
}

// Starts mongod with its files in server/.data/db as a one-node replica set
// (transactions need a replica set). If one is already running on the port, it is reused.
async function startLocalMongo() {
  const { localDbPath: dbPath, localDbPort: port } = config;
  const direct = `mongodb://127.0.0.1:${port}/?directConnection=true`;

  let client = await ping(direct);
  if (!client) {
    fs.mkdirSync(dbPath, { recursive: true });
    const { MongoBinary } = await import("mongodb-memory-server");
    const bin = await MongoBinary.getPath(); // downloads MongoDB once, then reuses it
    localMongod = spawn(bin, ["--dbpath", dbPath, "--port", String(port), "--bind_ip", "127.0.0.1", "--replSet", "rs0"], {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    localMongod.stderr.on("data", (d) => (stderr += d));
    localMongod.on("exit", (code) => {
      if (code && !config.isTest) console.error(`Local MongoDB stopped (code ${code}). ${stderr.slice(-500)}`);
      localMongod = null;
    });
    for (let i = 0; i < 60 && !client; i++) {
      await sleep(500);
      if (!localMongod) throw new Error(`Local MongoDB could not start. ${stderr.slice(-500)}`);
      client = await ping(direct);
    }
    if (!client) throw new Error("Local MongoDB did not start within 30 seconds.");
  }

  // First run: turn it into a replica set
  const admin = client.db("admin");
  try {
    await admin.command({ replSetGetStatus: 1 });
  } catch (err) {
    if (err.codeName !== "NotYetInitialized") throw err;
    await admin.command({ replSetInitiate: { _id: "rs0", members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
  }
  for (let i = 0; i < 60; i++) {
    if ((await admin.command({ hello: 1 })).isWritablePrimary) break;
    await sleep(250);
  }
  await client.close();
  return `mongodb://127.0.0.1:${port}/jalaram?replicaSet=rs0&directConnection=true`;
}

/* ---------- Connect ---------- */

export async function connectDb(uri = config.mongoUri) {
  if (!uri) {
    if (config.isProd) throw new Error("MONGODB_URI is required in production.");
    if (config.localDb === "disk") {
      uri = await startLocalMongo();
      console.log(`Using the local database saved in ${config.localDbPath}`);
    } else {
      // Temporary database for tests: gone when the process stops
      const { MongoMemoryReplSet } = await import("mongodb-memory-server");
      memoryServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      uri = memoryServer.getUri("jalaram");
      if (!config.isTest) console.warn("⚠  Using a temporary in-memory MongoDB. All data is lost when the server stops.");
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
  if (localMongod) {
    localMongod.kill();
    localMongod = null;
  }
}

// Runs fn inside a MongoDB transaction and retries on transient write conflicts.
export function withTransaction(fn) {
  return mongoose.connection.transaction(fn);
}
