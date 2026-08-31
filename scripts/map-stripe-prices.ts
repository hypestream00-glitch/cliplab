import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import Stripe from "stripe";

const ENV_LOCAL = path.join(process.cwd(), ".env.local");

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

function upsertEnv(filePath: string, updates: Record<string, string>) {
  let text = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  if (!text.endsWith("\n") && text.length) text += "\n";
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(text)) text = text.replace(pattern, line);
    else text += `${line}\n`;
  }
  writeFileSync(filePath, text, "utf8");
}

function summarizePrice(price: Stripe.Price) {
  const product = typeof price.product === "string" ? price.product : price.product && "deleted" in price.product ? null : price.product?.name ?? null;
  return {
    idPrefix: `${price.id.slice(0, 10)}…`,
    active: price.active,
    type: price.type,
    interval: price.recurring?.interval ?? null,
    currency: price.currency,
    unitAmount: price.unit_amount,
    livemode: price.livemode,
    productName: product,
  };
}

async function main() {
  const ids = process.argv.slice(2).filter((id) => id.startsWith("price_"));
  const env = { ...parseEnvFile(path.join(process.cwd(), ".env")), ...parseEnvFile(ENV_LOCAL) };
  const secret = env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!secret.startsWith("sk_test_")) {
    console.log(JSON.stringify({ ok: false, reason: "STRIPE_SECRET_KEY is not test mode" }));
    process.exit(1);
  }
  if (secret.startsWith("sk_live_")) {
    console.log(JSON.stringify({ ok: false, reason: "live key blocked" }));
    process.exit(1);
  }
  const stripe = new Stripe(secret);
  const retrieved = [];
  for (const id of ids) {
    const price = await stripe.prices.retrieve(id, { expand: ["product"] });
    retrieved.push({ id, ...summarizePrice(price), raw: price });
  }
  const creator = retrieved.find((item) => item.unitAmount === 5990 && item.currency === "brl" && item.interval === "month");
  const pro = retrieved.find((item) => item.unitAmount === 14990 && item.currency === "brl" && item.interval === "month");
  const mismatches = retrieved.filter((item) => item !== creator && item !== pro).map((item) => ({
    idPrefix: item.idPrefix,
    active: item.active,
    type: item.type,
    interval: item.interval,
    currency: item.currency,
    unitAmount: item.unitAmount,
    livemode: item.livemode,
    productName: item.productName,
  }));
  if (!creator || !pro || creator.id === pro.id) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: "price mapping mismatch",
          inspected: retrieved.map((item) => ({
            idPrefix: item.idPrefix,
            active: item.active,
            type: item.type,
            interval: item.interval,
            currency: item.currency,
            unitAmount: item.unitAmount,
            livemode: item.livemode,
            productName: item.productName,
          })),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  upsertEnv(ENV_LOCAL, {
    STRIPE_PRICE_CREATOR: creator.id,
    STRIPE_PRICE_PRO: pro.id,
  });
  console.log(
    JSON.stringify(
      {
        ok: true,
        livemode: creator.livemode === false && pro.livemode === false,
        creator: {
          active: creator.active,
          type: creator.type,
          interval: creator.interval,
          currency: creator.currency,
          unitAmount: creator.unitAmount,
          productName: creator.productName,
        },
        pro: {
          active: pro.active,
          type: pro.type,
          interval: pro.interval,
          currency: pro.currency,
          unitAmount: pro.unitAmount,
          productName: pro.productName,
        },
        mismatches,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.log(JSON.stringify({ ok: false, reason: error instanceof Error ? error.message : "unknown" }));
  process.exit(1);
});
