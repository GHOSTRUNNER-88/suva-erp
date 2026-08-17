import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

export async function GET(request) {
  await destroySession();
  return NextResponse.redirect(new URL("/login", request.url));
}
