import { NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/auth";
import { getLotteryStats, getLotteryConfig, getLotteryRecords } from "@/lib/lottery";

export async function GET() {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ success: false, message: "无权限" }, { status: 403 });
  }

  try {
    const [stats, config, recentRecords] = await Promise.all([
      getLotteryStats(),
      getLotteryConfig(),
      getLotteryRecords(20),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        todayDirectTotal: stats.todayDirectTotal,
        dailyDirectLimit: config.dailyDirectLimit,
        todayUsers: stats.todayUsers,
        todaySpins: stats.todaySpins,
        totalRecords: stats.totalRecords,
        enabled: config.enabled,
      },
      recentRecords: recentRecords.slice(0, 10),
    });
  } catch (error) {
    console.error("Get lottery stats error:", error);
    return NextResponse.json({ success: false, message: "获取统计失败" }, { status: 500 });
  }
}
