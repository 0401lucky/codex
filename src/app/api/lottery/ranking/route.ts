import { NextRequest, NextResponse } from "next/server";
import { getLotteryRecords } from "@/lib/lottery";

interface RankingUser {
  rank: number;
  userId: string;
  username: string;
  totalValue: number;
  bestPrize: string;
  count: number;
}

export async function GET(request: NextRequest) {
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 10, 1), 50);

  try {
    // 获取今天的所有记录
    const records = await getLotteryRecords(500);

    // 按用户聚合
    const userMap = new Map<string, { username: string; totalValue: number; bestPrize: string; bestValue: number; count: number }>();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    for (const record of records) {
      // 只统计今天的
      if (record.createdAt < todayStart) continue;
      // 跳过待确认记录
      if (record.tierName.startsWith("[待确认]")) continue;

      const userId = record.oderId;
      const existing = userMap.get(userId);

      if (existing) {
        existing.totalValue += record.tierValue;
        existing.count += 1;
        if (record.tierValue > existing.bestValue) {
          existing.bestPrize = record.tierName;
          existing.bestValue = record.tierValue;
        }
      } else {
        userMap.set(userId, {
          username: record.username,
          totalValue: record.tierValue,
          bestPrize: record.tierName,
          bestValue: record.tierValue,
          count: 1,
        });
      }
    }

    // 排序并取 top N
    const ranking: RankingUser[] = Array.from(userMap.entries())
      .sort((a, b) => b[1].totalValue - a[1].totalValue)
      .slice(0, limit)
      .map(([userId, data], index) => ({
        rank: index + 1,
        userId,
        username: data.username,
        totalValue: data.totalValue,
        bestPrize: data.bestPrize,
        count: data.count,
      }));

    return NextResponse.json({ success: true, ranking });
  } catch (error) {
    console.error("Get ranking error:", error);
    return NextResponse.json({ success: false, message: "获取排行榜失败" }, { status: 500 });
  }
}
