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

    // 统计今日参与用户数
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    const todayRecords = recentRecords.filter(r => r.createdAt >= todayStart);
    const todayUsers = new Set(todayRecords.map(r => r.oderId)).size;

    return NextResponse.json({
      success: true,
      stats: {
        todayDirectTotal: stats.todayDirectTotal,
        dailyDirectLimit: config.dailyDirectLimit,
        todayUsers,
        todaySpins: todayRecords.length,
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
