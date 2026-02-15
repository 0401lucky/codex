import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { spinLotteryDirect } from "@/lib/lottery";
import { getNewApiUserId } from "@/lib/user-mapping";

export async function POST() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "未登录" }, { status: 401 });
  }

  try {
    // 查找 newapi userId
    const newApiUserId = await getNewApiUserId(user.username);
    if (!newApiUserId) {
      return NextResponse.json({
        success: false,
        message: "未找到对应的 API 账户，请先在 API 平台注册（用户名需与 LinuxDo 相同）",
      }, { status: 400 });
    }

    // 执行直充抽奖
    const result = await spinLotteryDirect(user.linuxdoId, user.username, newApiUserId);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        record: result.record,
      });
    }

    return NextResponse.json({
      success: false,
      message: result.message,
      uncertain: result.uncertain,
    }, { status: result.uncertain ? 202 : 400 });
  } catch (error) {
    console.error("Spin lottery error:", error);
    return NextResponse.json({ success: false, message: "抽奖失败，请稍后重试" }, { status: 500 });
  }
}
