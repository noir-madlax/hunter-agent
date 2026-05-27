import { cookies } from "next/headers";

export const AUTH_COOKIE_NAME = "hunter_auth_session";
export const AUTH_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export function constantTimeEqual(a: string, b: string) {
  const maxLength = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

export function getAuthConfig() {
  const username = process.env.HUNTER_AUTH_USERNAME;
  const password = process.env.HUNTER_AUTH_PASSWORD;

  if (!username || !password) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Missing HUNTER_AUTH_USERNAME or HUNTER_AUTH_PASSWORD in production mode.");
    }
    return null; // Return null in dev mode to allow unconfigured startup, but middleware will check expectedToken
  }

  const secret = process.env.HUNTER_AUTH_SESSION_SECRET || "";
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("Missing HUNTER_AUTH_SESSION_SECRET in production mode. It must be a secure random string.");
  }

  return {
    username,
    password,
    realm: process.env.HUNTER_AUTH_REALM || "Hunter Agent",
    secret,
  };
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getExpectedSessionToken() {
  const config = getAuthConfig();
  if (!config) return null;

  return sha256Hex(["hunter-auth-session-v1", config.realm, config.secret || "local-dev-session"].join("\n"));
}

export function getSafeRedirectPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) {
    return "/projects";
  }

  return value;
}

export async function verifyAuth(): Promise<boolean> {
  const expectedToken = await getExpectedSessionToken();
  if (!expectedToken) return true; // not configured, allow bypass

  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    return !!sessionToken && constantTimeEqual(sessionToken, expectedToken);
  } catch {
    return false;
  }
}
