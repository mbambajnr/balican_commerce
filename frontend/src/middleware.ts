import { auth } from "@/lib/auth-config";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role;

  if (nextUrl.pathname.startsWith("/admin") &&
      !nextUrl.pathname.startsWith("/admin/login") &&
      !nextUrl.pathname.startsWith("/admin/register")) {
    if (!isLoggedIn || (role !== "admin" && role !== "super_admin")) {
      return NextResponse.redirect(new URL("/admin/login", nextUrl));
    }
  }

  if (nextUrl.pathname.startsWith("/account") ||
      nextUrl.pathname.startsWith("/orders")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/auth/login", nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|backend-api|.*\\.png$).*)"],
};
