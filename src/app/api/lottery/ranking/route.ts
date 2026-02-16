import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getTodayLotteryRecords } from "@/lib/lottery";

interface RankingUser {
  rank: number;
  userId: string;
  username: string;
  totalValue: number;
  bestPrize: string;
  count: number;
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "未登录" }, { status: 401 });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 10, 1), 50);

  try {
    const records = await getTodayLotteryRecords({ includePending: false });

    const userMap = new Map<string, { username: string; totalValue: number; bestPrize: string; bestValue: number; count: number }>();

    for (const record of records) {
      const userId = record.linuxdoId;
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
