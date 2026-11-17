// PostgreSQL connection, schema setup and transactions.
import fs from "node:fs";
import pg from "pg";
import { config } from "./config.js";

// BIGINT (paise, ids) and NUMERIC (rates) come back as JS numbers; DATE stays "YYYY-MM-DD"
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));
pg.types.setTypeParser(1082, (v) => v);

let pool = null;

const schemaSql = () => fs.readFileSync(new URL("./db/schema.sql", import.meta.url), "utf8");

function dbNameOf(url) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

// Creates the database (e.g. "jalaram") on first start if it doesn't exist yet
async function ensureDatabase(url) {
  const name = dbNameOf(url);
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Database name "${name}" may only use letters, numbers and _.`);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  try {
    await client.connect();
  } catch {
    return; // hosted databases usually don't allow this; the database already exists there
  }
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!rowCount) {
      await client.query(`CREATE DATABASE "${name}"`);
      if (!config.isTest) console.log(`Created PostgreSQL database "${name}".`);
    }
  } finally {
    await client.end();
  }
}

export async function connectDb(url = config.databaseUrl) {
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to server/.env, e.g. DATABASE_URL=postgres://postgres:PASSWORD@localhost:5432/jalaram"
    );
  }
  await ensureDatabase(url);
  pool = new pg.Pool({ connectionString: url, max: 10 });
  pool.on("error", (err) => console.error("PostgreSQL connection error", err.message));
  await pool.query(schemaSql());
  return pool;
}

export async function disconnectDb() {
  await pool?.end();
  pool = null;
}

export const dbReady = () => Boolean(pool);

// Single statement outside a transaction
export const query = (text, params) => pool.query(text, params);

// Same interface as a transaction client, so helpers can take either
export const db = { query };

// Runs fn(client) inside BEGIN/COMMIT; rolls back if anything throws.
// Every query in fn must use the `client` it receives.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Tests only: wipe everything and recreate the tables
export async function resetDatabase() {
  if (!dbNameOf(config.databaseUrl).endsWith("_test")) throw new Error("resetDatabase only runs on a *_test database.");
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await pool.query(schemaSql());
}
