import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getLotteryConfig, checkDailyLimit } from "@/lib/lottery";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "未登录" }, { status: 401 });
  }

  try {
    const [config, hasSpunToday] = await Promise.all([
      getLotteryConfig(),
      checkDailyLimit(user.linuxdoId),
    ]);

    const canSpin = config.enabled && !hasSpunToday;

    return NextResponse.json({
      success: true,
      enabled: config.enabled,
      canSpin,
      hasSpunToday,
      tiers: config.tiers,
    });
  } catch (error) {
    console.error("Get lottery status error:", error);
    return NextResponse.json({ success: false, message: "获取抽奖状态失败" }, { status: 500 });
  }
}
