import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function parseEnvFile(filePath: string) {
  const out: Record<string, string> = {};
  if (!existsSync(filePath)) return out;
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
const publicKeys = Object.keys(merged).filter((key) => key.startsWith("NEXT_PUBLIC_"));
const leaked = publicKeys.filter((key) => {
  const value = merged[key] ?? "";
  return value.startsWith("sk_") || value.startsWith("rk_") || value.startsWith("whsec_");
});
const webhookOnClient = publicKeys.includes("NEXT_PUBLIC_STRIPE_WEBHOOK_SECRET");
const secretOnClient = publicKeys.includes("NEXT_PUBLIC_STRIPE_SECRET_KEY");
const publishable = merged.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
console.log(
  JSON.stringify({
    publicKeyCount: publicKeys.length,
    leakedPublicSecrets: leaked.length,
    webhookOnClient,
    secretOnClient,
    publishableIsTest: publishable.startsWith("pk_test_"),
    publishableIsLive: publishable.startsWith("pk_live_"),
  }),
);
