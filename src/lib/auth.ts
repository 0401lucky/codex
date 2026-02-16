import { cookies } from "next/headers";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { kv } from "./redis";

function sanitizeEnvValue(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/\\r\\n|\\n|\\r/g, "").replace(/[\r\n]/g, "").trim();
}

function getAdminUsernames(): string[] {
  const adminEnv = sanitizeEnvValue(process.env.ADMIN_USERNAMES);
  if (!adminEnv) {
    if (process.env.NODE_ENV === "production") {
      console.warn("ADMIN_USERNAMES not set in production, no admin users configured!");
    }
    return [];
  }
  return adminEnv.split(",").map((name) => sanitizeEnvValue(name)).filter((name) => name.length > 0);
}

const ADMIN_USERNAMES = getAdminUsernames();

const SESSION_BLACKLIST_KEY = (jti: string) => `auth:session:blacklist:${jti}`;
const SESSION_REVOKED_AFTER_KEY = (linuxdoId: number) => `auth:session:revoked-after:${linuxdoId}`;
const SESSION_BLACKLIST_GRACE_SECONDS = 60;

let developmentFallbackSecret: string | null = null;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      if (!developmentFallbackSecret) {
        developmentFallbackSecret = randomBytes(32).toString("hex");
      }
      console.warn("SESSION_SECRET not set, using ephemeral development secret.");
      return developmentFallbackSecret;
    }
    throw new Error("FATAL: SESSION_SECRET environment variable is required in production!");
  }
  if (secret.length < 32 && process.env.NODE_ENV === "production") {
    throw new Error("FATAL: SESSION_SECRET must be at least 32 characters in production!");
  }
  return secret;
}

let _sessionSecret: string | null = null;
function getSecret(): string {
  if (!_sessionSecret) _sessionSecret = getSessionSecret();
  return _sessionSecret;
}

export interface AuthUser {
  linuxdoId: number;
  username: string;
  displayName: string;
  avatarUrl: string;
  isAdmin: boolean;
}

interface SessionData {
  linuxdoId: number;
  username: string;
  displayName: string;
  avatarUrl: string;
  isAdmin: boolean;
  exp: number;
  iat: number;
  jti: string;
}

interface SessionDataInput {
  linuxdoId: number;
  username: string;
  displayName: string;
  avatarUrl: string;
  isAdmin: boolean;
  exp: number;
  iat?: number;
  jti?: string;
}

export function signSession(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function verifySessionSignature(payload: string, signature: string): boolean {
  const expectedSignature = signSession(payload);
  const maxLen = Math.max(expectedSignature.length, signature.length);
  const expectedBuffer = Buffer.alloc(maxLen);
  const actualBuffer = Buffer.alloc(maxLen);
  expectedBuffer.write(expectedSignature, "utf8");
  actualBuffer.write(signature, "utf8");
  const same = timingSafeEqual(expectedBuffer, actualBuffer);
  return same && expectedSignature.length === signature.length;
}

export function createSessionToken(sessionData: SessionDataInput): string {
  const normalizedSessionData: SessionData = {
    ...sessionData,
    iat: sessionData.iat ?? Date.now(),
    jti: sessionData.jti ?? randomUUID(),
  };
  const payload = Buffer.from(JSON.stringify(normalizedSessionData)).toString("base64");
  const signature = signSession(payload);
  return `${payload}.${signature}`;
}

function isValidSessionData(data: unknown): data is SessionData {
  if (!data || typeof data !== "object") return false;
  const value = data as Record<string, unknown>;
  return (
    typeof value.linuxdoId === "number" && Number.isFinite(value.linuxdoId) &&
    typeof value.username === "string" && value.username.length > 0 &&
    typeof value.displayName === "string" &&
    typeof value.exp === "number" && Number.isFinite(value.exp) &&
    typeof value.iat === "number" && Number.isFinite(value.iat) &&
    typeof value.jti === "string" && value.jti.length > 0
  );
}

async function isSessionRevoked(sessionData: SessionData): Promise<boolean> {
  const [blacklisted, revokedAfterRaw] = await Promise.all([
    kv.get<string>(SESSION_BLACKLIST_KEY(sessionData.jti)),
    kv.get<string | number>(SESSION_REVOKED_AFTER_KEY(sessionData.linuxdoId)),
  ]);
  if (blacklisted !== null) return true;
  const revokedAfter = Number(revokedAfterRaw ?? 0);
  if (Number.isFinite(revokedAfter) && revokedAfter > 0 && sessionData.iat <= revokedAfter) return true;
  return false;
}

async function getValidSessionData(sessionCookie: string): Promise<SessionData | null> {
  const sessionData = parseSessionToken(sessionCookie);
  if (!sessionData) return null;
  if (sessionData.exp < Date.now()) return null;
  if (await isSessionRevoked(sessionData)) return null;
  return sessionData;
}

export async function revokeSessionToken(token: string): Promise<void> {
  const sessionData = parseSessionToken(token);
  if (!sessionData) return;
  const ttlSeconds = Math.max(1, Math.ceil((sessionData.exp - Date.now()) / 1000) + SESSION_BLACKLIST_GRACE_SECONDS);
  await kv.set(SESSION_BLACKLIST_KEY(sessionData.jti), "1", { ex: ttlSeconds });
}

export function parseSessionToken(token: string): SessionData | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!verifySessionSignature(payload, signature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
    if (!isValidSessionData(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("app_session")?.value;
  if (!sessionCookie) return null;
  try {
    const sessionData = await getValidSessionData(sessionCookie);
    if (!sessionData) return null;
    return {
      linuxdoId: sessionData.linuxdoId,
      username: sessionData.username,
      displayName: sessionData.displayName,
      avatarUrl: sessionData.avatarUrl,
      isAdmin: ADMIN_USERNAMES.includes(sessionData.username),
    };
  } catch (error) {
    console.error("Session decode error:", error);
    return null;
  }
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.isAdmin || false;
}

export function isAdminUsername(username: string): boolean {
  return ADMIN_USERNAMES.includes(username);
}
