import { stderr, exit } from "node:process";

stderr.write(
  "Refusing to overwrite 20260901034100_add_processing_job (already applied in production).\nRun: node scripts/generate-reconcile-migration.mjs\n",
);
exit(1);
