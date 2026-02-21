import Redis from "ioredis";

// ioredis 单例
let redis: Redis | null = null;

function getRedisInstance(): Redis {
  if (redis) return redis;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set. Please configure it in environment variables.");
  }

  redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  redis.on("error", (err) => {
    console.error("Redis connection error:", err.message);
  });

  return redis;
}

/**
 * 兼容 @vercel/kv 的封装层
 * 提供与 @vercel/kv 一致的 API，底层使用 ioredis
 */
export const kv = {
  /** GET with auto JSON deserialization */
  async get<T = unknown>(key: string): Promise<T | null> {
    const r = getRedisInstance();
    const raw = await r.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  },

  /** SET with auto JSON serialization + optional NX/EX */
  async set(
    key: string,
    value: unknown,
    opts?: { nx?: boolean; ex?: number }
  ): Promise<string | null> {
    const r = getRedisInstance();
    const serialized = typeof value === "string" ? value : JSON.stringify(value);

    if (opts?.nx && opts?.ex) {
      return r.set(key, serialized, "EX", opts.ex, "NX");
    }
    if (opts?.nx) {
      return r.set(key, serialized, "NX");
    }
    if (opts?.ex) {
      return r.set(key, serialized, "EX", opts.ex);
    }
    return r.set(key, serialized);
  },

  /** DEL */
  async del(...keys: string[]): Promise<number> {
    const r = getRedisInstance();
    return r.del(...keys);
  },

  /** EVAL — 兼容 @vercel/kv 的参数格式 */
  async eval(
    script: string,
    keys: string[],
    args: (string | number)[]
  ): Promise<unknown> {
    const r = getRedisInstance();
    // ioredis: eval(script, numKeys, ...keys, ...args)
    return r.eval(script, keys.length, ...keys, ...args);
  },

  /** LPUSH with auto JSON serialization */
  async lpush(key: string, ...values: unknown[]): Promise<number> {
    const r = getRedisInstance();
    const serialized = values.map((v) =>
      typeof v === "string" ? v : JSON.stringify(v)
    );
    return r.lpush(key, ...serialized);
  },

  /** LRANGE with auto JSON deserialization */
  async lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]> {
    const r = getRedisInstance();
    const raw = await r.lrange(key, start, stop);
    return raw.map((item) => {
      try {
        return JSON.parse(item) as T;
      } catch {
        return item as unknown as T;
      }
    });
  },

  /** LLEN */
  async llen(key: string): Promise<number> {
    const r = getRedisInstance();
    return r.llen(key);
  },

  /** LTRIM */
  async ltrim(key: string, start: number, stop: number): Promise<"OK"> {
    const r = getRedisInstance();
    return r.ltrim(key, start, stop);
  },

  /** SADD */
  async sadd(key: string, ...members: (string | number)[]): Promise<number> {
    const r = getRedisInstance();
    return r.sadd(key, ...members.map(String));
  },

  /** SCARD */
  async scard(key: string): Promise<number> {
    const r = getRedisInstance();
    return r.scard(key);
  },

  /** SMEMBERS */
  async smembers(key: string): Promise<string[]> {
    const r = getRedisInstance();
    return r.smembers(key);
  },

  /** SCAN */
  async scan(
    cursor: string | number,
    opts?: { match?: string; count?: number }
  ): Promise<[string, string[]]> {
    const r = getRedisInstance();
    const cursorText = String(cursor);
    const count = typeof opts?.count === "number" && opts.count > 0
      ? Math.floor(opts.count)
      : undefined;

    if (opts?.match && count) {
      return r.scan(cursorText, "MATCH", opts.match, "COUNT", count);
    }
    if (opts?.match) {
      return r.scan(cursorText, "MATCH", opts.match);
    }
    if (count) {
      return r.scan(cursorText, "COUNT", count);
    }
    return r.scan(cursorText);
  },

  /** SISMEMBER */
  async sismember(key: string, member: string): Promise<number> {
    const r = getRedisInstance();
    return r.sismember(key, member);
  },

  /** SREM */
  async srem(key: string, ...members: string[]): Promise<number> {
    const r = getRedisInstance();
    return r.srem(key, ...members);
  },

  /** MGET with auto JSON deserialization */
  async mget<T = unknown>(...keys: string[]): Promise<(T | null)[]> {
    const r = getRedisInstance();
    const raw = await r.mget(...keys);
    return raw.map((item) => {
      if (item === null) return null;
      try {
        return JSON.parse(item) as T;
      } catch {
        return item as unknown as T;
      }
    });
  },

  /** INCRBY */
  async incrby(key: string, increment: number): Promise<number> {
    const r = getRedisInstance();
    return r.incrby(key, increment);
  },

  /** DECRBY */
  async decrby(key: string, decrement: number): Promise<number> {
    const r = getRedisInstance();
    return r.decrby(key, decrement);
  },

  /** INCR */
  async incr(key: string): Promise<number> {
    const r = getRedisInstance();
    return r.incr(key);
  },

  /** TTL */
  async ttl(key: string): Promise<number> {
    const r = getRedisInstance();
    return r.ttl(key);
  },

  /** EXPIRE */
  async expire(key: string, seconds: number): Promise<number> {
    const r = getRedisInstance();
    return r.expire(key, seconds);
  },
};
