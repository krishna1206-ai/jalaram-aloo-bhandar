import { createApp } from "./app.js";
import { config } from "./config.js";
import { connectDb, disconnectDb } from "./db.js";
import { ensureIndexes, seedAll } from "./seed.js";

await connectDb();
await ensureIndexes();
await seedAll();

const server = createApp().listen(config.port, () => {
  console.log(`API ready on http://localhost:${config.port}/api`);
});

async function shutdown() {
  server.close();
  await disconnectDb();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
