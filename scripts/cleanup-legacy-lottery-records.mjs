import Redis from "ioredis";

const OLD_KEY = "lottery:records";
const RECENT_KEY = "lottery:records:recent";
const DAY_PREFIX = "lottery:records:day:";
const TOTAL_KEY = "lottery:records:total";
const DEFAULT_BACKUP_TTL_DAYS = 30;

function hasArg(flag) {
  return process.argv.includes(flag);
}

function getArgValue(flag, fallbackValue) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) return fallbackValue;
  return process.argv[index + 1];
}

function getTodayDateStringInChina() {
  const chinaOffsetMs = 8 * 60 * 60 * 1000;
  const chinaNow = new Date(Date.now() + chinaOffsetMs);
  const year = chinaNow.getUTCFullYear();
  const month = String(chinaNow.getUTCMonth() + 1).padStart(2, "0");
  const day = String(chinaNow.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function printUsage() {
  console.log("Usage:");
  console.log("  npm run cleanup:lottery:legacy");
  console.log("  npm run cleanup:lottery:legacy -- --apply");
  console.log("  npm run cleanup:lottery:legacy -- --apply --delete-now --force");
  console.log("");
  console.log("Flags:");
  console.log("  --apply                 Apply cleanup action. Without this, the script is dry-run.");
  console.log("  --delete-now            Delete old key immediately instead of archive rename.");
  console.log("  --force                 Skip safety check when new keys are empty.");
  console.log("  --backup-ttl-days <N>   Backup retention days after rename. Default: 30.");
  console.log("  --help                  Show this help.");
}

async function getListLength(redis, key) {
  const type = await redis.type(key);
  if (type === "none") return { type, length: 0 };
  if (type !== "list") {
    throw new Error(`Key "${key}" type is "${type}", expected list.`);
  }
  const length = await redis.llen(key);
  return { type, length };
}

async function main() {
  if (hasArg("--help")) {
    printUsage();
    return;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is required.");
  }

  const apply = hasArg("--apply");
  const deleteNow = hasArg("--delete-now");
  const force = hasArg("--force");
  const backupTtlDaysInput = Number(getArgValue("--backup-ttl-days", String(DEFAULT_BACKUP_TTL_DAYS)));
  const backupTtlDays = Number.isFinite(backupTtlDaysInput) && backupTtlDaysInput > 0
    ? backupTtlDaysInput
    : DEFAULT_BACKUP_TTL_DAYS;

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  try {
    const todayDayKey = `${DAY_PREFIX}${getTodayDateStringInChina()}`;
    const [oldMeta, recentMeta, todayMeta] = await Promise.all([
      getListLength(redis, OLD_KEY),
      getListLength(redis, RECENT_KEY),
      getListLength(redis, todayDayKey),
    ]);

    const totalRaw = await redis.get(TOTAL_KEY);
    const totalCount = totalRaw === null ? null : Number(totalRaw);

    console.log("=== Lottery Legacy Cleanup Summary ===");
    console.log(`old key (${OLD_KEY}): length=${oldMeta.length}`);
    console.log(`recent key (${RECENT_KEY}): length=${recentMeta.length}`);
    console.log(`today key (${todayDayKey}): length=${todayMeta.length}`);
    console.log(`total key (${TOTAL_KEY}): value=${Number.isFinite(totalCount) ? totalCount : "N/A"}`);
    console.log("");

    if (oldMeta.length === 0) {
      console.log("No legacy list data found. Nothing to clean.");
      return;
    }

    if (!apply) {
      console.log("Dry-run mode, no data changed.");
      console.log("Run with --apply to execute cleanup.");
      return;
    }

    if (!force && recentMeta.length === 0 && todayMeta.length === 0) {
      throw new Error("Safety check failed: new archive keys are both empty. Use --force if this is expected.");
    }

    if (deleteNow) {
      const deletedCount = await redis.del(OLD_KEY);
      console.log(`Deleted old key immediately. DEL count=${deletedCount}.`);
      return;
    }

    const backupKey = `${OLD_KEY}:legacy:backup:${Date.now()}`;
    const backupTtlSeconds = Math.max(24 * 60 * 60, Math.floor(backupTtlDays * 24 * 60 * 60));

    await redis.rename(OLD_KEY, backupKey);
    await redis.expire(backupKey, backupTtlSeconds);

    console.log(`Renamed old key to backup: ${backupKey}`);
    console.log(`Backup TTL set to ${backupTtlDays} day(s).`);
    console.log("If all checks are good later, backup key can be deleted manually.");
  } finally {
    redis.disconnect();
  }
}

main().catch((error) => {
  console.error("Cleanup failed:", error.message);
  process.exitCode = 1;
});
