const ALLOWED_EXT = [".mp4", ".mov", ".webm"];
const ALLOWED_MIME = ["video/mp4", "video/quicktime", "video/webm", "video/x-quicktime"];

export class InvalidVideoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVideoError";
  }
}

export function validateUploadFile(params: { filename: string; mimeType: string; sizeBytes: number; maxBytes: number }) {
  const name = params.filename.toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  if (!ALLOWED_EXT.includes(ext)) {
    throw new InvalidVideoError("Formato não suportado. Envie MP4, MOV ou WEBM.");
  }
  const mime = params.mimeType.toLowerCase();
  const mimeOk =
    !mime ||
    ALLOWED_MIME.includes(mime) ||
    mime === "application/octet-stream" ||
    (mime.startsWith("video/") && ALLOWED_EXT.includes(ext));
  if (!mimeOk) {
    throw new InvalidVideoError(`Tipo MIME inválido: ${params.mimeType}`);
  }
  if (params.sizeBytes <= 0) {
    throw new InvalidVideoError("Arquivo vazio.");
  }
  if (params.sizeBytes > params.maxBytes) {
    const mb = Math.round(params.maxBytes / (1024 * 1024));
    throw new InvalidVideoError(`Arquivo excede o limite de ${mb} MB do plano.`);
  }
  return { ext, mime: ALLOWED_MIME.includes(mime) ? mime : mime || "video/mp4" };
}

export function looksLikeVideoContainer(header: Buffer) {
  if (header.length < 12) return false;
  const ascii = header.toString("latin1");
  if (ascii.includes("ftyp")) return true;
  if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) return true;
  return false;
}

export function validateClipWindow(startMs: number, endMs: number, durationMs: number) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(durationMs)) {
    throw new InvalidVideoError("Timestamps de clipe inválidos.");
  }
  if (startMs < 0) throw new InvalidVideoError("startMs não pode ser negativo.");
  if (endMs > durationMs) throw new InvalidVideoError("endMs não pode ultrapassar a duração do vídeo.");
  if (endMs <= startMs) throw new InvalidVideoError("endMs precisa ser maior que startMs.");
  return { startMs: Math.round(startMs), endMs: Math.round(endMs), durationMs: Math.round(endMs - startMs) };
}
