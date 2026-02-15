import { NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/auth";
import { getLotteryConfig, updateLotteryConfig, LotteryConfig } from "@/lib/lottery";

export async function GET() {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ success: false, message: "无权限" }, { status: 403 });
  }

  try {
    const config = await getLotteryConfig();
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("Get lottery config error:", error);
    return NextResponse.json({ success: false, message: "获取配置失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ success: false, message: "无权限" }, { status: 403 });
  }

  try {
    const body = await request.json() as Partial<LotteryConfig>;

    // 只允许更新特定字段
    const updates: Partial<LotteryConfig> = {};
    if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
    if (typeof body.dailyDirectLimit === "number" && Number.isFinite(body.dailyDirectLimit) && body.dailyDirectLimit >= 0) {
      updates.dailyDirectLimit = body.dailyDirectLimit;
    }
    if (Array.isArray(body.tiers)) {
      updates.tiers = body.tiers;
    }

    await updateLotteryConfig(updates);
    const newConfig = await getLotteryConfig();

    return NextResponse.json({ success: true, config: newConfig });
  } catch (error) {
    console.error("Update lottery config error:", error);
    return NextResponse.json({ success: false, message: "更新配置失败" }, { status: 500 });
  }
}
