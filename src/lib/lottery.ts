import { kv } from "./redis";
import { getTodayDateString, getSecondsUntilMidnight } from "./time";

// 抽奖档位
export interface LotteryTier {
  id: string;
  name: string;
  value: number;
  probability: number;
  color: string;
}

// 抽奖记录
export interface LotteryRecord {
  id: string;
  oderId: string;        // linuxdoId
  username: string;       // LinuxDo username
  tierName: string;
  tierValue: number;
  directCredit: boolean;
  creditedQuota?: number;
  createdAt: number;
}

// 抽奖配置
export interface LotteryConfig {
  enabled: boolean;
  dailyDirectLimit: number;
  tiers: LotteryTier[];
}

const DEFAULT_TIERS: LotteryTier[] = [
  { id: "tier_1", name: "1刀福利", value: 1, probability: 40, color: "#22c55e" },
  { id: "tier_3", name: "3刀福利", value: 3, probability: 30, color: "#3b82f6" },
  { id: "tier_5", name: "5刀福利", value: 5, probability: 18, color: "#f59e0b" },
  { id: "tier_10", name: "10刀福利", value: 10, probability: 8, color: "#ec4899" },
  { id: "tier_15", name: "15刀福利", value: 15, probability: 3, color: "#8b5cf6" },
  { id: "tier_20", name: "20刀福利", value: 20, probability: 1, color: "#ef4444" },
];

const DEFAULT_CONFIG: LotteryConfig = {
  enabled: true,
  dailyDirectLimit: 2000,
  tiers: DEFAULT_TIERS,
};

// KV Keys
const LOTTERY_CONFIG_KEY = "lottery:config";
const LOTTERY_RECORDS_KEY = "lottery:records";
const LOTTERY_USER_RECORDS_PREFIX = "lottery:user:records:";
const LOTTERY_DAILY_PREFIX = "lottery:daily:";
const LOTTERY_DAILY_DIRECT_KEY = "lottery:daily_direct:";
const DIRECT_AMOUNT_SCALE = 100;

function cloneDefaultLotteryConfig(): LotteryConfig {
  return { ...DEFAULT_CONFIG, tiers: DEFAULT_TIERS.map((tier) => ({ ...tier })) };
}

function sanitizeLotteryConfig(config: Partial<LotteryConfig>): LotteryConfig {
  const fallback = cloneDefaultLotteryConfig();

  const tiers = Array.isArray(config.tiers) && config.tiers.length > 0
    ? config.tiers.map((tier, index) => {
        const base = fallback.tiers[index] ?? fallback.tiers[fallback.tiers.length - 1];
        return {
          id: typeof tier?.id === "string" && tier.id.trim() ? tier.id : base.id,
          name: typeof tier?.name === "string" && tier.name.trim() ? tier.name : base.name,
          value: typeof tier?.value === "number" && Number.isFinite(tier.value) ? tier.value : base.value,
          probability: typeof tier?.probability === "number" && Number.isFinite(tier.probability) ? tier.probability : base.probability,
          color: typeof tier?.color === "string" && tier.color.trim() ? tier.color : base.color,
        };
      })
    : fallback.tiers;

  return {
    enabled: typeof config.enabled === "boolean" ? config.enabled : fallback.enabled,
    dailyDirectLimit: typeof config.dailyDirectLimit === "number" && Number.isFinite(config.dailyDirectLimit) ? config.dailyDirectLimit : fallback.dailyDirectLimit,
    tiers,
  };
}

// ============ 配置管理 ============

export async function getLotteryConfig(): Promise<LotteryConfig> {
  const fallback = cloneDefaultLotteryConfig();
  try {
    const config = await kv.get<Partial<LotteryConfig>>(LOTTERY_CONFIG_KEY);
    if (!config) {
      try { await kv.set(LOTTERY_CONFIG_KEY, fallback); } catch { /* ignore */ }
      return fallback;
    }
    return sanitizeLotteryConfig(config);
  } catch {
    return fallback;
  }
}

export async function updateLotteryConfig(config: Partial<LotteryConfig>): Promise<void> {
  const current = await getLotteryConfig();
  await kv.set(LOTTERY_CONFIG_KEY, { ...current, ...config });
}

// ============ 每日免费次数 ============

export async function tryClaimDailyFree(linuxdoId: number): Promise<boolean> {
  const today = getTodayDateString();
  const key = `${LOTTERY_DAILY_PREFIX}${linuxdoId}:${today}`;
  const ttl = getSecondsUntilMidnight();
  const result = await kv.set(key, "1", { nx: true, ex: ttl });
  return result === "OK";
}

export async function releaseDailyFree(linuxdoId: number): Promise<void> {
  const today = getTodayDateString();
  const key = `${LOTTERY_DAILY_PREFIX}${linuxdoId}:${today}`;
  await kv.del(key);
}

export async function checkDailyLimit(linuxdoId: number): Promise<boolean> {
  const today = getTodayDateString();
  const key = `${LOTTERY_DAILY_PREFIX}${linuxdoId}:${today}`;
  const result = await kv.get(key);
  return result !== null;
}

// ============ 每日直充额度 ============

export async function getTodayDirectTotal(): Promise<number> {
  const today = getTodayDateString();
  const totalCents = await kv.get<number>(`${LOTTERY_DAILY_DIRECT_KEY}${today}`);
  return (totalCents || 0) / DIRECT_AMOUNT_SCALE;
}

export async function reserveDailyDirectQuota(dollars: number): Promise<{ success: boolean; newTotal: number }> {
  const config = await getLotteryConfig();
  const today = getTodayDateString();
  const key = `${LOTTERY_DAILY_DIRECT_KEY}${today}`;
  const ttl = getSecondsUntilMidnight() + 3600;
  const cents = Math.round(dollars * DIRECT_AMOUNT_SCALE);
  const limitCents = Math.round(config.dailyDirectLimit * DIRECT_AMOUNT_SCALE);

  if (cents <= 0) {
    return { success: false, newTotal: await getTodayDirectTotal() };
  }

  const luaScript = `
    local key = KEYS[1]
    local cents = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local ttl = tonumber(ARGV[3])
    local newTotal = redis.call('INCRBY', key, cents)
    if redis.call('TTL', key) == -1 then
      redis.call('EXPIRE', key, ttl)
    end
    if newTotal > limit then
      redis.call('DECRBY', key, cents)
      return {0, newTotal - cents}
    end
    return {1, newTotal}
  `;

  const result = await kv.eval(luaScript, [key], [cents, limitCents, ttl]) as [number, number];
  const [success, newTotalCents] = result;
  return { success: success === 1, newTotal: (newTotalCents || 0) / DIRECT_AMOUNT_SCALE };
}

export async function rollbackDailyDirectQuota(dollars: number): Promise<void> {
  const today = getTodayDateString();
  const key = `${LOTTERY_DAILY_DIRECT_KEY}${today}`;
  const cents = Math.round(dollars * DIRECT_AMOUNT_SCALE);
  if (cents <= 0) return;
  await kv.decrby(key, cents);
}

// ============ 加权随机 ============

function weightedRandomSelect(tiers: LotteryTier[]): LotteryTier | null {
  const totalWeight = tiers.reduce((sum, tier) => sum + tier.probability, 0);
  if (totalWeight <= 0) return null;
  let random = Math.random() * totalWeight;
  for (const tier of tiers) {
    random -= tier.probability;
    if (random <= 0) return tier;
  }
  return tiers[tiers.length - 1];
}

// ============ 直充模式抽奖 ============

export async function spinLotteryDirect(
  linuxdoId: number,
  username: string,
  newApiUserId: number
): Promise<{ success: boolean; record?: LotteryRecord; message: string; uncertain?: boolean }> {
  const { creditQuotaToUser } = await import('./new-api');

  // 第一步：原子性占用每日免费次数
  let usedDailyFree = false;
  try {
    const dailyResult = await tryClaimDailyFree(linuxdoId);
    if (!dailyResult) {
      return { success: false, message: "今日免费次数已用完，明天再来吧" };
    }
    usedDailyFree = true;
  } catch {
    return { success: false, message: "系统繁忙，请稍后再试" };
  }

  const rollbackSpinCount = async () => {
    if (usedDailyFree) {
      try { await releaseDailyFree(linuxdoId); } catch { /* ignore */ }
    }
  };

  let reservedDollars = 0;

  try {
    // 第二步：检查配置
    const config = await getLotteryConfig();
    if (!config.enabled) {
      await rollbackSpinCount();
      return { success: false, message: "抽奖活动暂未开放" };
    }

    // 第三步：获取剩余额度并过滤可选档位
    const todayTotal = await getTodayDirectTotal();
    const remainingQuota = config.dailyDirectLimit - todayTotal;
    const affordableTiers = config.tiers.filter(t => t.probability > 0 && t.value <= remainingQuota);

    if (affordableTiers.length === 0) {
      await rollbackSpinCount();
      return { success: false, message: "今日发放额度已达上限，请明日再试" };
    }

    // 加权随机选择
    const selectedTier = weightedRandomSelect(affordableTiers);
    if (!selectedTier) {
      await rollbackSpinCount();
      return { success: false, message: "抽奖配置异常，请联系管理员" };
    }

    // 第四步：原子性预占每日直充额度
    const reserveResult = await reserveDailyDirectQuota(selectedTier.value);
    if (!reserveResult.success) {
      await rollbackSpinCount();
      return { success: false, message: "今日发放额度已达上限，请明日再试" };
    }
    reservedDollars = selectedTier.value;

    // 第五步：执行直充
    const creditResult = await creditQuotaToUser(newApiUserId, selectedTier.value);

    // 处理不确定的情况
    if (creditResult.uncertain) {
      console.warn("直充结果不确定，不回滚:", creditResult.message);
      const pendingRecord: LotteryRecord = {
        id: `lottery_pending_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        oderId: String(linuxdoId),
        username,
        tierName: `[待确认] ${selectedTier.name}`,
        tierValue: selectedTier.value,
        directCredit: true,
        createdAt: Date.now(),
      };
      try {
        await kv.lpush(LOTTERY_RECORDS_KEY, pendingRecord);
        await kv.lpush(`${LOTTERY_USER_RECORDS_PREFIX}${linuxdoId}`, pendingRecord);
      } catch { /* ignore */ }
      return { success: false, message: "充值结果不确定，请稍后检查余额", uncertain: true };
    }

    if (!creditResult.success) {
      await rollbackDailyDirectQuota(reservedDollars);
      await rollbackSpinCount();
      return { success: false, message: "充值失败，请稍后重试" };
    }

    // ===== 提交点：直充成功，不再回滚 =====

    const record: LotteryRecord = {
      id: `lottery_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      oderId: String(linuxdoId),
      username,
      tierName: selectedTier.name,
      tierValue: selectedTier.value,
      directCredit: true,
      creditedQuota: creditResult.newQuota,
      createdAt: Date.now(),
    };

    // 写入记录（best-effort）
    try { await kv.lpush(LOTTERY_RECORDS_KEY, record); } catch { /* ignore */ }
    try { await kv.lpush(`${LOTTERY_USER_RECORDS_PREFIX}${linuxdoId}`, record); } catch { /* ignore */ }

    return {
      success: true,
      record,
      message: `恭喜获得 ${selectedTier.name}！已直接充值到您的账户`,
    };

  } catch (error) {
    console.error("spinLotteryDirect 异常:", error);
    if (reservedDollars > 0) {
      await rollbackDailyDirectQuota(reservedDollars);
    }
    await rollbackSpinCount();
    return { success: false, message: "系统错误，请稍后再试" };
  }
}

// ============ 记录查询 ============

export async function getLotteryRecords(limit: number = 50, offset: number = 0): Promise<LotteryRecord[]> {
  return await kv.lrange<LotteryRecord>(LOTTERY_RECORDS_KEY, offset, offset + limit - 1);
}

export async function getUserLotteryRecords(linuxdoId: number, limit: number = 20): Promise<LotteryRecord[]> {
  return await kv.lrange<LotteryRecord>(`${LOTTERY_USER_RECORDS_PREFIX}${linuxdoId}`, 0, limit - 1);
}

// ============ 统计 ============

export async function getLotteryStats(): Promise<{
  todayDirectTotal: number;
  todaySpins: number;
  totalRecords: number;
}> {
  const [todayDirectTotal, totalRecords] = await Promise.all([
    getTodayDirectTotal(),
    kv.llen(LOTTERY_RECORDS_KEY),
  ]);

  return {
    todayDirectTotal,
    todaySpins: 0, // 简化：可从记录中统计
    totalRecords,
  };
}
