import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function classify(value: string | undefined, test: string, live: string) {
  const v = value?.trim() ?? "";
  if (!v) return "MISSING";
  if (v.startsWith(live)) return "LIVE";
  if (v.startsWith(test)) return "TEST";
  if (test === "price_" && v.startsWith("price_")) return "PRESENT";
  if (test === "whsec_" && v.startsWith("whsec_")) return "TEST";
  return "UNKNOWN";
}

function parseEnvFile(filePath: string) {
  if (!existsSync(filePath)) return {} as Record<string, string>;
  const out: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const local = parseEnvFile(path.join(process.cwd(), ".env.local"));
const env = parseEnvFile(path.join(process.cwd(), ".env"));
const merged = { ...env, ...local };
const report = {
  STRIPE_SECRET_KEY: classify(merged.STRIPE_SECRET_KEY, "sk_test_", "sk_live_"),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: classify(
    merged.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? merged.STRIPE_PUBLISHABLE_KEY,
    "pk_test_",
    "pk_live_",
  ),
  STRIPE_WEBHOOK_SECRET: classify(merged.STRIPE_WEBHOOK_SECRET, "whsec_", "whsec_live_unused"),
  STRIPE_PRICE_CREATOR: classify(merged.STRIPE_PRICE_CREATOR, "price_", "price_live_unused"),
  STRIPE_PRICE_PRO: classify(merged.STRIPE_PRICE_PRO, "price_", "price_live_unused"),
  BILLING_CHECKOUT_ENABLED: merged.BILLING_CHECKOUT_ENABLED ? "SET" : "UNSET",
  envLocalExists: existsSync(path.join(process.cwd(), ".env.local")),
};
console.log(JSON.stringify(report, null, 2));
