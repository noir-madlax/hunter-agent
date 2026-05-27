import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/session-auth";

export async function POST() {
  const response = new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}
