export function cookieSecure() {
  if (process.env.NODE_ENV === "production") return true;
  return (process.env.AUTH_URL ?? "").startsWith("https://");
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure(),
    path: "/",
  };
}
