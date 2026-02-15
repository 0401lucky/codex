import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForToken, getUserInfo } from "@/lib/linuxdo-oauth";
import { createSessionToken, isAdminUsername } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

  // OAuth 错误
  if (error) {
    console.error("OAuth error:", error);
    return NextResponse.redirect(`${appUrl}/login?error=oauth_denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/login?error=missing_params`);
  }

  // 验证 state
  const cookieStore = await cookies();
  const savedState = cookieStore.get("oauth_state")?.value;
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(`${appUrl}/login?error=invalid_state`);
  }

  // 清除 state cookie
  cookieStore.delete("oauth_state");

  try {
    // 1. code → access_token
    const tokenResult = await exchangeCodeForToken(code);

    // 2. access_token → user info
    const userInfo = await getUserInfo(tokenResult.access_token);

    // 3. 创建 session
    const sessionToken = createSessionToken({
      linuxdoId: userInfo.id,
      username: userInfo.username,
      displayName: userInfo.name || userInfo.username,
      avatarUrl: userInfo.avatar_url || "",
      isAdmin: isAdminUsername(userInfo.username),
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 天
    });

    // 4. 设置 session cookie
    cookieStore.set("app_session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60, // 7 天
      path: "/",
    });

    // 5. 重定向到抽奖页面
    return NextResponse.redirect(`${appUrl}/lottery`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(`${appUrl}/login?error=callback_failed`);
  }
}
