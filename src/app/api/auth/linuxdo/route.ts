import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { buildAuthorizeUrl } from "@/lib/linuxdo-oauth";

export async function GET() {
  // 生成 state 防 CSRF
  const state = randomBytes(16).toString("hex");

  // 将 state 存入 cookie 用于回调验证
  const cookieStore = await cookies();
  cookieStore.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 分钟
    path: "/",
  });

  const authorizeUrl = buildAuthorizeUrl(state);
  return NextResponse.redirect(authorizeUrl);
}
