import mysql, { Pool, PoolOptions, QueryOptions } from 'mysql2/promise';

let pool: Pool | null = null;
type QueryParams = NonNullable<QueryOptions['values']>;

function getPool(): Pool {
  if (pool) return pool;

  const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error('MYSQL_URL is not set. Please configure it in environment variables.');
  }

  const parsed = new URL(url);
  const config: PoolOptions = {
    host: parsed.hostname,
    port: Number(parsed.port) || 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
  };

  pool = mysql.createPool(config);
  return pool;
}

export const db = {
  async query<T = Record<string, unknown>>(sql: string, params?: QueryParams): Promise<T[]> {
    const p = getPool();
    const [rows] = typeof params === 'undefined'
      ? await p.execute(sql)
      : await p.execute(sql, params);
    return rows as T[];
  },

  async queryOne<T = Record<string, unknown>>(sql: string, params?: QueryParams): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  },
};
