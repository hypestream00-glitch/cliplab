/**
 * Legacy Server Action / proxy body size for local fallback and URL forms.
 * Production video bytes go Browser → signed PUT → R2 (`docs/UPLOAD.md`), not through Next.js RAM.
 */
export const UPLOAD_BODY_SIZE_LIMIT = "600mb" as const;
