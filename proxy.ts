import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = Boolean(req.auth);
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/forgot-password") || pathname.startsWith("/reset-password");
  const isProtected = pathname.startsWith("/studio") || pathname.startsWith("/admin") || pathname.startsWith("/onboarding") || pathname.startsWith("/billing");

  if (isProtected && !isLoggedIn) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("callbackUrl", pathname);
    const response = NextResponse.redirect(url);
    response.headers.set("x-request-id", crypto.randomUUID());
    return response;
  }

  if (isAuthPage && isLoggedIn) {
    const response = NextResponse.redirect(new URL("/studio", req.nextUrl));
    response.headers.set("x-request-id", crypto.randomUUID());
    return response;
  }

  if (pathname.startsWith("/admin") && req.auth?.user?.role !== "SUPER_ADMIN") {
    const response = NextResponse.redirect(new URL("/studio", req.nextUrl));
    response.headers.set("x-request-id", crypto.randomUUID());
    return response;
  }

  const response = NextResponse.next();
  response.headers.set("x-request-id", crypto.randomUUID());
  return response;
});

export const config = {
  matcher: ["/studio/:path*", "/admin/:path*", "/onboarding/:path*", "/billing/:path*", "/login", "/register", "/forgot-password", "/reset-password"],
};
