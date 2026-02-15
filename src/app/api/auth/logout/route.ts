import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("app_session");

  return NextResponse.json({ success: true, message: "已登出" });
}
