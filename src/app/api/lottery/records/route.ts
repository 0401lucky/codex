import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getUserLotteryRecords } from "@/lib/lottery";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "未登录" }, { status: 401 });
  }

  try {
    const records = await getUserLotteryRecords(user.linuxdoId, 50);
    return NextResponse.json({ success: true, records });
  } catch (error) {
    console.error("Get records error:", error);
    return NextResponse.json({ success: false, message: "获取记录失败" }, { status: 500 });
  }
}
