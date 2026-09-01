export const PIX_KEY_TYPES = ["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"] as const;
export type PixKeyType = (typeof PIX_KEY_TYPES)[number];

export function isPixKeyType(value: string): value is PixKeyType {
  return (PIX_KEY_TYPES as readonly string[]).includes(value);
}

export function normalizePixKey(type: PixKeyType, raw: string) {
  const trimmed = raw.trim();
  if (type === "EMAIL") return trimmed.toLowerCase();
  if (type === "EVP") return trimmed.toLowerCase();
  if (type === "PHONE") {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.startsWith("55")) return `+${digits}`;
    return `+55${digits}`;
  }
  return trimmed.replace(/\D/g, "");
}

export function validatePixKey(type: PixKeyType, raw: string) {
  const value = normalizePixKey(type, raw);
  if (type === "CPF") return /^\d{11}$/.test(value) && !/^(\d)\1{10}$/.test(value);
  if (type === "CNPJ") return /^\d{14}$/.test(value);
  if (type === "EMAIL") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 120;
  if (type === "PHONE") return /^\+55\d{10,11}$/.test(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function maskPixKey(type: PixKeyType, normalized: string) {
  if (type === "CPF" && normalized.length === 11) {
    return `***.***.***-${normalized.slice(-2)}`;
  }
  if (type === "CNPJ" && normalized.length === 14) {
    return `**.***.***/****-${normalized.slice(-2)}`;
  }
  if (type === "EMAIL") {
    const [local, domain] = normalized.split("@");
    if (!local || !domain) return "***";
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}***@${domain}`;
  }
  if (type === "PHONE") {
    return `(**) *****-${normalized.slice(-4)}`;
  }
  return `********-****-****-****-********${normalized.slice(-4)}`;
}

export function maskHolderDocument(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return null;
  if (digits.length === 11) return `***.***.***-${digits.slice(-2)}`;
  if (digits.length === 14) return `**.***.***/****-${digits.slice(-2)}`;
  return `***${digits.slice(-4)}`;
}

export function pixKeyLast4(normalized: string) {
  return normalized.slice(-4);
}
