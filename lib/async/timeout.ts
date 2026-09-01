export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function withTimeoutFallback<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
  _label: string,
): Promise<T> {
  try {
    return await withTimeout(promise, ms, _label);
  } catch {
    return fallback;
  }
}

export function isNextRedirectError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const digest = "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  return digest.includes("NEXT_REDIRECT");
}

export function safeErrorType(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    const code = (error as { code: string }).code;
    if (/^P\d{4}$/.test(code)) return `Prisma ${code}`;
  }
  if (error instanceof Error && error.name) return error.name;
  if (error instanceof Error && /timeout/i.test(error.message)) return "TimeoutError";
  return "Error";
}
