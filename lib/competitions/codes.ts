import { randomBytes } from "node:crypto";

export function generateParticipantCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let body = "";
  for (const byte of bytes) {
    body += alphabet[byte % alphabet.length];
  }
  return `CC-${body}`;
}
