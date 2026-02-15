import { kv } from './redis';
import { searchUserByUsername } from './new-api';

const MAPPING_PREFIX = 'mapping:linuxdo:';
const MAPPING_TTL_SECONDS = 24 * 60 * 60; // 24 小时

interface UserMapping {
  newApiUserId: number;
  cachedAt: number;
}

/**
 * 根据 LinuxDo 用户名查找 newapi userId
 * 1. 先查 Redis 缓存
 * 2. 缓存未命中或过期时调用 newapi admin API 搜索
 * 3. 缓存结果到 Redis
 */
export async function getNewApiUserId(linuxdoUsername: string): Promise<number | null> {
  const cacheKey = `${MAPPING_PREFIX}${linuxdoUsername}`;

  // 1. 查缓存
  const cached = await kv.get<UserMapping>(cacheKey);
  if (cached && cached.newApiUserId) {
    const age = Date.now() - (cached.cachedAt || 0);
    if (age < MAPPING_TTL_SECONDS * 1000) {
      return cached.newApiUserId;
    }
  }

  // 2. 调用 newapi 搜索
  const user = await searchUserByUsername(linuxdoUsername);
  if (!user) {
    return null;
  }

  // 3. 缓存映射
  const mapping: UserMapping = {
    newApiUserId: user.id,
    cachedAt: Date.now(),
  };
  await kv.set(cacheKey, mapping, { ex: MAPPING_TTL_SECONDS });

  return user.id;
}

/**
 * 清除用户映射缓存（用于管理员手动刷新）
 */
export async function clearUserMapping(linuxdoUsername: string): Promise<void> {
  const cacheKey = `${MAPPING_PREFIX}${linuxdoUsername}`;
  await kv.del(cacheKey);
}
