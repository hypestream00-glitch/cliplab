type HeaderReader = { get(name: string): string | null };

const SCANNER_UA =
  /safelinks|proofpoint|barracuda|mimecast|googleimageproxy|yahoomailproxy|superhuman|microsoft office|outlook-ios|prefetch/i;

export function isEmailLinkPrefetch(headers: HeaderReader) {
  const purpose = `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""} ${headers.get("x-purpose") ?? ""}`.toLowerCase();
  if (purpose.includes("prefetch") || purpose.includes("preview") || purpose.includes("prerender")) return true;
  if (headers.get("next-router-prefetch")) return true;
  if ((headers.get("x-moz") ?? "").toLowerCase() === "prefetch") return true;
  const mode = (headers.get("sec-fetch-mode") ?? "").toLowerCase();
  const dest = (headers.get("sec-fetch-dest") ?? "").toLowerCase();
  if (dest === "empty" && (mode === "no-cors" || mode === "cors") && purpose.includes("prefetch")) return true;
  if (SCANNER_UA.test(headers.get("user-agent") ?? "")) return true;
  return false;
}

export function isEmailLinkHead(method: string) {
  return method.toUpperCase() === "HEAD";
}
