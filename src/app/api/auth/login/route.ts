import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_MAX_AGE,
  constantTimeEqual,
  getAuthConfig,
  getExpectedSessionToken,
  getSafeRedirectPath,
} from "@/lib/session-auth";

function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const nextPath = getSafeRedirectPath(String(formData.get("next") || "/projects"));
  const config = getAuthConfig();

  if (!config) {
    return redirectTo(nextPath);
  }

  const validUsername = constantTimeEqual(username, config.username);
  const validPassword = constantTimeEqual(password, config.password);

  if (!validUsername || !validPassword) {
    const loginUrl = new URL("/login", "http://local");
    loginUrl.searchParams.set("next", nextPath);
    loginUrl.searchParams.set("error", "1");
    return redirectTo(`${loginUrl.pathname}${loginUrl.search}`);
  }

  const token = await getExpectedSessionToken();
  if (!token) {
    return redirectTo(nextPath);
  }

  const response = redirectTo(nextPath);
  const isSecureRequest =
    request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: AUTH_SESSION_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest,
  });

  return response;
}
