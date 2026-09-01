import { createRequire } from "node:module";
import { defineConfig } from "prisma/config";

try {
  createRequire(import.meta.url)("dotenv/config");
} catch {
  // Production images may omit dotenv; DATABASE_URL comes from the environment.
}

// Generate does not open a connection. The placeholder matches .env.example so
// `prisma generate` works during npm ci when DATABASE_URL is not injected yet.
// Runtime queries still require a real DATABASE_URL in lib/db/prisma.ts.
const datasourceUrl =
  process.env.DATABASE_URL?.trim() || "postgresql://cliplab:cliplab@localhost:5432/cliplab";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: datasourceUrl,
  },
});
