// src/lib/time.ts

const CHINA_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

export function getChinaTime(date: Date = new Date()): Date {
  return new Date(date.getTime() + CHINA_TZ_OFFSET_MS);
}

export function getChinaDayStartTimestamp(date: Date = new Date()): number {
  const chinaTime = getChinaTime(date);
  const chinaDayStart = new Date(chinaTime);
  chinaDayStart.setUTCHours(0, 0, 0, 0);
  return chinaDayStart.getTime() - CHINA_TZ_OFFSET_MS;
}

export function getTodayDateString(): string {
  const chinaTime = getChinaTime();
  const year = chinaTime.getUTCFullYear();
  const month = String(chinaTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(chinaTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getSecondsUntilMidnight(): number {
  const now = new Date();
  const todayStart = getChinaDayStartTimestamp(now);
  const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((tomorrowStart - now.getTime()) / 1000));
}
