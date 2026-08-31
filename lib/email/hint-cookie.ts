import { cookies } from "next/headers";

const COOKIE = "cliplab_verify_email";

export async function setVerifyEmailHint(email: string) {
  const store = await cookies();
  store.set(COOKIE, email.toLowerCase(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}

export async function getVerifyEmailHint() {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

export async function clearVerifyEmailHint() {
  const store = await cookies();
  store.delete(COOKIE);
}
