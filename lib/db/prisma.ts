import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export function isDatabaseUrlConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/** Creates the client on first real query. Importing this module does not open Postgres. */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

export function resetPrismaClientForTests() {
  globalForPrisma.prisma = undefined;
}

function isThenableOrInspectProp(prop: PropertyKey) {
  return (
    prop === "then" ||
    prop === "catch" ||
    prop === "finally" ||
    prop === "$$typeof" ||
    prop === "__esModule" ||
    prop === "toJSON" ||
    typeof prop === "symbol"
  );
}

/**
 * Lazy singleton compatible with existing `prisma.model` call sites.
 * `then` is intentionally undefined so Next.js/Turbopack cannot treat this
 * export as a Promise and call getPrisma() while collecting route config.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (isThenableOrInspectProp(prop)) return undefined;
    const client = getPrisma();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
