import { NextResponse } from "next/server";
import { CHEF_SESSION_COOKIE, sessionCookieOptions } from "../../../chef-auth";

export async function POST(request: Request) {
  const response = new NextResponse(null, { status: 303, headers: { location: "/" } });
  response.cookies.set(CHEF_SESSION_COOKIE, "", { ...sessionCookieOptions(request), maxAge: 0 });
  return response;
}
