import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateReferralCode(bytes = 8) {
  const buf = randomBytes(bytes);
  let out = "";
  for (const value of buf) out += ALPHABET[value % ALPHABET.length];
  return out;
}

export function normalizeReferralCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
