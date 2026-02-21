import { kv } from './redis';
import { db } from './mysql';

const MAPPING_PREFIX = 'mapping:linuxdo:';
const MAPPING_TTL_SECONDS = 24 * 60 * 60; // 24 小时
const MAPPING_MISS_TTL_SECONDS = 10 * 60; // 未命中缓存 10 分钟
const MAPPING_COLUMN_CACHE_KEY = 'mapping:linuxdo:column:users';
const MAPPING_COLUMN_CACHE_TTL_SECONDS = 24 * 60 * 60;

type LinuxDoIdColumn = 'linux_do_id' | 'linuxdo_id';

interface UserMapping {
  newApiUserId: number | null;
  cachedAt: number;
  found?: boolean;
}

function isMysqlUnknownColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'ER_BAD_FIELD_ERROR';
}

async function queryNewApiUserIdFromMysql(linuxdoId: number): Promise<number | null> {
  const cachedColumn = await kv.get<LinuxDoIdColumn>(MAPPING_COLUMN_CACHE_KEY);
  // 生产环境主字段是 linux_do_id，linuxdo_id 仅用于兼容旧结构
  const allColumns: LinuxDoIdColumn[] = ['linux_do_id', 'linuxdo_id'];
  const columns = cachedColumn
    ? [cachedColumn, ...allColumns.filter((column) => column !== cachedColumn)]
    : allColumns;

  let hasSuccessfulQuery = false;

  for (const column of columns) {
    try {
      const row = await db.queryOne<{ id: number }>(
        `SELECT id FROM users WHERE ${column} = ? LIMIT 1`,
        [String(linuxdoId)]
      );
      hasSuccessfulQuery = true;
      await kv.set(MAPPING_COLUMN_CACHE_KEY, column, { ex: MAPPING_COLUMN_CACHE_TTL_SECONDS });

      if (row && row.id > 0) {
        return row.id;
      }
    } catch (error) {
      if (isMysqlUnknownColumnError(error)) {
        continue;
      }
      throw error;
    }
  }

  if (!hasSuccessfulQuery) {
    console.error('[user-mapping] users 表中未找到 linuxdo_id / linux_do_id 字段');
  }

  return null;
}

/**
 * 根据 LinuxDo ID 查找 newapi userId
 * 直接查 NewAPI 的 MySQL 数据库：SELECT id FROM users WHERE linux_do_id = ?
 *
 * 1. 先查 Redis 缓存
 * 2. 缓存未命中时直接查 MySQL
 * 3. 缓存结果到 Redis
 */
export async function getNewApiUserId(
  linuxdoId: number,
  options?: { forceRefresh?: boolean }
): Promise<number | null> {
  const cacheKey = `${MAPPING_PREFIX}${linuxdoId}`;
  const forceRefresh = options?.forceRefresh === true;

  // 1. 查缓存
  if (!forceRefresh) {
    const cached = await kv.get<UserMapping>(cacheKey);
    if (cached && typeof cached.cachedAt === 'number') {
      const age = Date.now() - cached.cachedAt;
      if (age < MAPPING_TTL_SECONDS * 1000) {
        if (cached.found === false) return null;
        if (typeof cached.newApiUserId === 'number' && cached.newApiUserId > 0) {
          return cached.newApiUserId;
        }
      }
    }
  }

  // 2. 直接查 NewAPI 的 MySQL
  try {
    const userId = await queryNewApiUserIdFromMysql(linuxdoId);

    if (typeof userId === 'number' && userId > 0) {
      // 命中：缓存映射
      console.log('[user-mapping] found via MySQL', { linuxdoId, newApiUserId: userId });
      await kv.set(cacheKey, {
        newApiUserId: userId,
        cachedAt: Date.now(),
        found: true,
      } satisfies UserMapping, { ex: MAPPING_TTL_SECONDS });
      return userId;
    }

    // 未找到：缓存未命中结果，避免频繁查库
    console.warn('[user-mapping] not found in MySQL', { linuxdoId });
    await kv.set(cacheKey, {
      newApiUserId: null,
      cachedAt: Date.now(),
      found: false,
    } satisfies UserMapping, { ex: MAPPING_MISS_TTL_SECONDS });
    return null;
  } catch (error) {
    console.error('[user-mapping] MySQL query error:', error);
    return null;
  }
}

/**
 * 清除用户映射缓存
 */
export async function clearUserMapping(linuxdoId: number): Promise<void> {
  const cacheKey = `${MAPPING_PREFIX}${linuxdoId}`;
  await kv.del(cacheKey);
}
