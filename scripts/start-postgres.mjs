import EmbeddedPostgres from "embedded-postgres";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const databaseDir = path.resolve("data/postgres");
mkdirSync(databaseDir, { recursive: true });

const alreadyInitialized = existsSync(path.join(databaseDir, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "cliplab",
  password: "cliplab",
  port: 5432,
  persistent: true,
  onLog: (message) => {
    const text = String(message).trim();
    if (text) console.log(`[postgres] ${text}`);
  },
  onError: (error) => {
    console.error("[postgres]", error);
  },
});

if (!alreadyInitialized) {
  await pg.initialise();
}

await pg.start();

try {
  await pg.createDatabase("cliplab");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!/already exists/i.test(message)) {
    console.warn("[postgres] createDatabase:", message);
  }
}

console.log("PostgreSQL local pronto em postgresql://cliplab:cliplab@localhost:5432/cliplab");

await new Promise(() => undefined);
