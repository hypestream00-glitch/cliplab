import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = ["app", "lib", "components", "prisma"];
const FORBIDDEN = [
  "NEXT_PUBLIC_STRIPE_SECRET",
  "NEXT_PUBLIC_STRIPE_WEBHOOK",
  "NEXT_PUBLIC_OPENAI",
  "NEXT_PUBLIC_UPLOAD_POST",
  "NEXT_PUBLIC_AUTH_SECRET",
  "NEXT_PUBLIC_ENCRYPTION",
  "4242424242424242",
  "Olá, Ana",
];

function walk(dir: string, files: string[] = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "generated") continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) files.push(full);
  }
  return files;
}

describe("client-side secrets and identity copy", () => {
  it("does not ship secrets, test cards, or hardcoded Ana greetings", () => {
    const files = ROOTS.flatMap((dir) => walk(path.join(process.cwd(), dir)));
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const token of FORBIDDEN) {
        if (text.includes(token)) hits.push(`${path.relative(process.cwd(), file)}:${token}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
