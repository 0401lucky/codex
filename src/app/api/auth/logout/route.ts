import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeSessionToken } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("app_session")?.value;
  if (token) {
    try {
      await revokeSessionToken(token);
    } catch (error) {
      console.error("Revoke session token failed:", error);
    }
  }
  cookieStore.delete("app_session");

  return NextResponse.json({ success: true, message: "已登出" });
}
