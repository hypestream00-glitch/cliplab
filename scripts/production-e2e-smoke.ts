import "dotenv/config";
import { config } from "dotenv";
import { runProductionE2ESmoke } from "@/lib/e2e/production-smoke";

config({ path: ".env.local", override: true });

async function main() {
  const result = await runProductionE2ESmoke();
  process.exit(result.ok ? 0 : 1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unexpected error";
  process.stdout.write(`E2E SMOKE: FAIL ${message}\n`);
  process.exit(1);
});
