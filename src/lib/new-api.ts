import { kv } from './redis';
import { maskUserId, maskUsername } from './logging';

let _newApiUrl: string | null = null;

const USER_QUOTA_LOCK_PREFIX = 'newapi:quota:credit:lock:';
const USER_QUOTA_LOCK_TTL_SECONDS = 15;
const USER_QUOTA_LOCK_RETRY_MS = 120;
const USER_QUOTA_LOCK_MAX_RETRIES = 25;

type UserQuotaLock = {
  key: string;
  token: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireUserQuotaLock(userId: number): Promise<UserQuotaLock | null> {
  const key = `${USER_QUOTA_LOCK_PREFIX}${userId}`;
  const token = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  for (let attempt = 0; attempt < USER_QUOTA_LOCK_MAX_RETRIES; attempt += 1) {
    const locked = await kv.set(key, token, { nx: true, ex: USER_QUOTA_LOCK_TTL_SECONDS });
    if (locked === 'OK') {
      return { key, token };
    }
    await sleep(USER_QUOTA_LOCK_RETRY_MS);
  }

  return null;
}

async function releaseUserQuotaLock(lock: UserQuotaLock): Promise<void> {
  const luaScript = `
    local key = KEYS[1]
    local expected = ARGV[1]
    local current = redis.call('GET', key)
    if current == expected then
      return redis.call('DEL', key)
    end
    return 0
  `;
  try {
    await kv.eval(luaScript, [lock.key], [lock.token]);
  } catch (error) {
    console.error('Release quota lock failed:', error);
  }
}

function sanitizeEnvValue(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\\r\\n|\\n|\\r/g, '').replace(/[\r\n]/g, '').trim();
}

export function getNewApiUrl(): string {
  if (_newApiUrl) return _newApiUrl;
  const rawUrl = sanitizeEnvValue(process.env.NEW_API_URL);
  if (!rawUrl) {
    throw new Error("NEW_API_URL is not set.");
  }
  _newApiUrl = rawUrl.replace(/\/+$/, "");
  return _newApiUrl;
}

export interface NewApiUser {
  id: number;
  username: string;
  display_name: string;
  role: number;
  status: number;
  email: string;
  quota: number;
  used_quota: number;
}

export async function loginToNewApi(username: string, password: string): Promise<{ success: boolean; message: string; cookies?: string; user?: NewApiUser }> {
  try {
    const baseUrl = getNewApiUrl();
    const safeUsername = sanitizeEnvValue(username);
    const safePassword = sanitizeEnvValue(password);
    console.log("Attempting login to new-api", { endpoint: `${baseUrl}/api/user/login`, username: maskUsername(safeUsername) });

    const response = await fetch(`${baseUrl}/api/user/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: safeUsername, password: safePassword }),
    });

    let cookies = response.headers.get("set-cookie") || "";
    if (!cookies) {
      const setCookieHeader = response.headers.getSetCookie?.();
      if (setCookieHeader && setCookieHeader.length > 0) {
        cookies = setCookieHeader.join("; ");
      }
    }

    const data = await response.json();
    console.log("Login response:", {
      success: data.success,
      message: data.message,
      hasCookies: !!cookies,
      hasData: !!data.data,
      userId: maskUserId(data.data?.id)
    });

    if (data.success) {
      return { success: true, message: "登录成功", cookies, user: data.data };
    }
    return { success: false, message: data.message || "登录失败" };
  } catch (error) {
    console.error("Login error:", error);
    return { success: false, message: "服务连接失败" };
  }
}

export async function getUserFromNewApi(sessionCookie: string): Promise<NewApiUser | null> {
  try {
    const baseUrl = getNewApiUrl();
    const response = await fetch(`${baseUrl}/api/user/self`, {
      headers: { Cookie: sessionCookie },
    });
    const data = await response.json();
    if (data.success && data.data) return data.data;
    return null;
  } catch (error) {
    console.error("Get user error:", error);
    return null;
  }
}

// 管理员会话缓存
let adminSessionCache: { cookies: string; expiresAt: number } | null = null;

export async function getAdminSession(): Promise<string | null> {
  if (adminSessionCache && adminSessionCache.expiresAt > Date.now() + 5 * 60 * 1000) {
    return adminSessionCache.cookies;
  }

  const username = sanitizeEnvValue(process.env.NEW_API_ADMIN_USERNAME);
  const password = sanitizeEnvValue(process.env.NEW_API_ADMIN_PASSWORD);
  if (!username || !password) {
    console.error('Admin credentials not configured.');
    return null;
  }

  const result = await loginToNewApi(username, password);
  if (!result.success || !result.cookies) {
    console.error('Admin login failed:', result.message);
    return null;
  }

  adminSessionCache = {
    cookies: result.cookies,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
  return result.cookies;
}

let adminSessionWithUserCache: { cookies: string; adminUserId: number; expiresAt: number } | null = null;

export async function getAdminSessionWithUser(): Promise<{ cookies: string; adminUserId: number } | null> {
  if (adminSessionWithUserCache && adminSessionWithUserCache.expiresAt > Date.now() + 5 * 60 * 1000) {
    return { cookies: adminSessionWithUserCache.cookies, adminUserId: adminSessionWithUserCache.adminUserId };
  }

  const username = sanitizeEnvValue(process.env.NEW_API_ADMIN_USERNAME);
  const password = sanitizeEnvValue(process.env.NEW_API_ADMIN_PASSWORD);
  if (!username || !password) {
    console.error('Admin credentials not configured');
    return null;
  }

  const result = await loginToNewApi(username, password);
  if (!result.success || !result.cookies || !result.user?.id) {
    console.error('Admin login failed:', result.message);
    return null;
  }

  adminSessionWithUserCache = {
    cookies: result.cookies,
    adminUserId: result.user.id,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
  return { cookies: result.cookies, adminUserId: result.user.id };
}

/**
 * 通过管理员 API 搜索用户（按用户名）
 */
export async function searchUserByUsername(username: string): Promise<NewApiUser | null> {
  const loginResult = await getAdminSessionWithUser();
  if (!loginResult) return null;

  try {
    const baseUrl = getNewApiUrl();
    const response = await fetch(`${baseUrl}/api/user/search?keyword=${encodeURIComponent(username)}`, {
      headers: {
        Cookie: loginResult.cookies,
        'New-Api-User': String(loginResult.adminUserId),
      },
    });
    const data = await response.json();
    if (data.success && data.data) {
      // 搜索结果可能有多个，精确匹配用户名
      const users = Array.isArray(data.data) ? data.data : [data.data];
      const exactMatch = users.find(
        (u: NewApiUser) => u.username.toLowerCase() === username.toLowerCase()
      );
      return exactMatch || null;
    }
    return null;
  } catch (error) {
    console.error("Search user error:", error);
    return null;
  }
}

export async function creditQuotaToUser(
  userId: number,
  dollars: number
): Promise<{ success: boolean; message: string; newQuota?: number; uncertain?: boolean }> {
  const baseUrl = getNewApiUrl();
  const loginResult = await getAdminSessionWithUser();
  if (!loginResult) {
    return { success: false, message: '管理员会话获取失败' };
  }

  const { cookies: adminCookies, adminUserId } = loginResult;
  const lock = await acquireUserQuotaLock(userId);
  if (!lock) {
    return { success: false, message: '系统繁忙，充值请求排队中，请稍后重试' };
  }

  let expectedQuota: number | undefined;

  try {
    try {
      const userResponse = await fetch(`${baseUrl}/api/user/${userId}`, {
        headers: {
          Cookie: adminCookies,
          'New-Api-User': String(adminUserId),
        },
      });
      const userData = await userResponse.json();
      if (!userData.success || !userData.data) {
        return { success: false, message: '获取用户信息失败' };
      }

      const user = userData.data;
      const currentQuota = user.quota || 0;
      const quotaToAdd = Math.floor(dollars * 500000);
      const newQuota = currentQuota + quotaToAdd;
      expectedQuota = newQuota;

      const updatePayload = { ...user, id: userId, quota: newQuota };
      const sanitizedUpdatePayload = Object.fromEntries(
        Object.entries(updatePayload).filter(([, value]) => value !== undefined)
      );

      const updateResponse = await fetch(`${baseUrl}/api/user/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookies,
          'New-Api-User': String(adminUserId),
        },
        body: JSON.stringify(sanitizedUpdatePayload),
      });

      let updateData;
      try {
        updateData = await updateResponse.json();
      } catch {
        const verifyResult = await verifyQuotaUpdate(userId, newQuota, adminCookies, adminUserId);
        return verifyResult;
      }

      if (updateData.success) {
        return { success: true, message: `成功充值 $${dollars}`, newQuota };
      }

      const verifyResult = await verifyQuotaUpdate(userId, newQuota, adminCookies, adminUserId);
      if (verifyResult.success || verifyResult.uncertain) return verifyResult;
      return { success: false, message: updateData.message || '额度更新失败' };
    } catch (error) {
      console.error('Credit quota error:', error);
      try {
        const nextLoginResult = await getAdminSessionWithUser();
        if (nextLoginResult) {
          const verifyResult = await verifyQuotaUpdate(userId, expectedQuota, nextLoginResult.cookies, nextLoginResult.adminUserId);
          if (verifyResult.uncertain) {
            return { success: false, message: '充值结果不确定，请稍后检查余额', uncertain: true };
          }
          return verifyResult;
        }
      } catch (verifyError) {
        console.error('Verification also failed:', verifyError);
      }
      return { success: false, message: '服务连接失败，结果不确定，请检查余额', uncertain: true };
    }
  } finally {
    await releaseUserQuotaLock(lock);
  }
}

async function verifyQuotaUpdate(
  userId: number,
  expectedQuota: number | undefined,
  adminCookies: string,
  adminUserId: number
): Promise<{ success: boolean; message: string; newQuota?: number; uncertain?: boolean }> {
  try {
    const baseUrl = getNewApiUrl();
    const verifyResponse = await fetch(`${baseUrl}/api/user/${userId}`, {
      headers: {
        Cookie: adminCookies,
        'New-Api-User': String(adminUserId),
      },
    });
    const verifyData = await verifyResponse.json();

    if (verifyData.success && verifyData.data) {
      const currentQuota = verifyData.data.quota || 0;
      if (expectedQuota !== undefined && currentQuota >= expectedQuota) {
        return { success: true, message: '充值已确认成功', newQuota: currentQuota };
      } else if (expectedQuota === undefined) {
        return { success: false, message: '无法确认充值结果', newQuota: currentQuota, uncertain: true };
      } else {
        return { success: false, message: '充值确认失败' };
      }
    }
    return { success: false, message: '验证用户信息失败', uncertain: true };
  } catch (error) {
    console.error('Verify quota update error:', error);
    return { success: false, message: '验证失败', uncertain: true };
  }
}
