import "dotenv/config";
import { defineConfig } from "prisma/config";

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
