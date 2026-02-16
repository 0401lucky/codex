import { NextResponse } from "next/server";
import { getAuthUser, isAdmin } from "@/lib/auth";
import { getLotteryConfig, updateLotteryConfig, LotteryConfig } from "@/lib/lottery";

const MAX_DAILY_DIRECT_LIMIT = 1_000_000;
const MAX_TIERS = 20;
const TIER_COLOR_HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseConfigUpdates(body: unknown): { updates?: Partial<LotteryConfig>; error?: string } {
  if (!isPlainObject(body)) {
    return { error: "请求体必须是 JSON 对象" };
  }

  const updates: Partial<LotteryConfig> = {};
  let hasAnyField = false;

  if ("enabled" in body) {
    hasAnyField = true;
    if (typeof body.enabled !== "boolean") {
      return { error: "enabled 必须是布尔值" };
    }
    updates.enabled = body.enabled;
  }

  if ("dailyDirectLimit" in body) {
    hasAnyField = true;
    if (
      typeof body.dailyDirectLimit !== "number" ||
      !Number.isFinite(body.dailyDirectLimit) ||
      body.dailyDirectLimit < 0 ||
      body.dailyDirectLimit > MAX_DAILY_DIRECT_LIMIT
    ) {
      return { error: `dailyDirectLimit 必须是 0 到 ${MAX_DAILY_DIRECT_LIMIT} 之间的数字` };
    }
    updates.dailyDirectLimit = body.dailyDirectLimit;
  }

  if ("tiers" in body) {
    hasAnyField = true;
    if (!Array.isArray(body.tiers) || body.tiers.length === 0 || body.tiers.length > MAX_TIERS) {
      return { error: `tiers 必须是 1 到 ${MAX_TIERS} 项的数组` };
    }

    const idSet = new Set<string>();
    const normalizedTiers: LotteryConfig["tiers"] = [];
    let totalProbability = 0;

    for (const tier of body.tiers) {
      if (!isPlainObject(tier)) {
        return { error: "tiers 中每一项都必须是对象" };
      }

      const id = typeof tier.id === "string" ? tier.id.trim() : "";
      const name = typeof tier.name === "string" ? tier.name.trim() : "";
      const color = typeof tier.color === "string" ? tier.color.trim() : "";
      const value = Number(tier.value);
      const probability = Number(tier.probability);

      if (!id || id.length > 64) return { error: "tier.id 必须是 1-64 字符" };
      if (idSet.has(id)) return { error: "tier.id 不能重复" };
      idSet.add(id);

      if (!name || name.length > 64) return { error: "tier.name 必须是 1-64 字符" };
      if (!Number.isFinite(value) || value <= 0 || value > 100_000) {
        return { error: "tier.value 必须是 0 到 100000 之间的正数" };
      }
      if (!Number.isFinite(probability) || probability < 0 || probability > 100) {
        return { error: "tier.probability 必须是 0 到 100 之间的数字" };
      }
      if (!TIER_COLOR_HEX_PATTERN.test(color)) {
        return { error: "tier.color 必须是十六进制颜色（如 #f97316）" };
      }

      totalProbability += probability;
      normalizedTiers.push({ id, name, color, value, probability });
    }

    if (totalProbability <= 0) {
      return { error: "tiers 总权重必须大于 0" };
    }

    updates.tiers = normalizedTiers;
  }

  if (!hasAnyField) {
    return { error: "未提供可更新字段（enabled / dailyDirectLimit / tiers）" };
  }

  return { updates };
}

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
    const body = await request.json() as unknown;
    const parsed = parseConfigUpdates(body);
    if (parsed.error || !parsed.updates) {
      return NextResponse.json(
        { success: false, message: parsed.error || "配置校验失败" },
        { status: 400 }
      );
    }

    await updateLotteryConfig(parsed.updates);
    const newConfig = await getLotteryConfig();

    return NextResponse.json({ success: true, config: newConfig });
  } catch (error) {
    console.error("Update lottery config error:", error);
    return NextResponse.json({ success: false, message: "更新配置失败" }, { status: 500 });
  }
}
