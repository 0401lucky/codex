// src/lib/time.ts

const CHINA_TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

export function getChinaTime(date: Date = new Date()): Date {
  return new Date(date.getTime() + CHINA_TZ_OFFSET_MS);
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
  const chinaTime = getChinaTime(now);
  const tomorrow = new Date(chinaTime);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const tomorrowUTC = new Date(tomorrow.getTime() - CHINA_TZ_OFFSET_MS);
  return Math.max(1, Math.ceil((tomorrowUTC.getTime() - now.getTime()) / 1000));
}
