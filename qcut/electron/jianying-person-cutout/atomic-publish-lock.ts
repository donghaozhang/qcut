import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const LOCK_RETRY_MS = 25;
const LOCK_WAIT_MS = 90_000;
export const ATOMIC_PUBLISH_LOCK_OWNER_FILE_NAME = "owner.json";

export interface AtomicPublishLockTiming {
  retryMs?: number;
  waitMs?: number;
}

interface LockOwner {
  pid?: unknown;
}

function processExists({ pid }: { pid: number }) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function removeAbandonedLock({ lockPath }: { lockPath: string }) {
  try {
    const ownerValue: unknown = JSON.parse(
      await readFile(
        `${lockPath}/${ATOMIC_PUBLISH_LOCK_OWNER_FILE_NAME}`,
        "utf8",
      ),
    );
    const owner = ownerValue as LockOwner;
    if (
      typeof owner.pid !== "number" ||
      !Number.isSafeInteger(owner.pid) ||
      owner.pid <= 0 ||
      processExists({ pid: owner.pid })
    ) {
      return false;
    }
    await rm(lockPath, { force: true, recursive: true });
    return true;
  } catch {
    return false;
  }
}

async function acquireDirectoryLock({
  lockPath,
  startedAt,
  timing,
}: {
  lockPath: string;
  startedAt: number;
  timing: AtomicPublishLockTiming;
}): Promise<() => Promise<void>> {
  try {
    await mkdir(lockPath);
    try {
      await writeFile(
        `${lockPath}/${ATOMIC_PUBLISH_LOCK_OWNER_FILE_NAME}`,
        JSON.stringify({ createdAt: Date.now(), pid: process.pid }),
        "utf8",
      );
    } catch (error) {
      await rm(lockPath, { force: true, recursive: true });
      throw error;
    }
    return () => rm(lockPath, { force: true, recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }

  if (Date.now() - startedAt > (timing.waitMs ?? LOCK_WAIT_MS)) {
    if (await removeAbandonedLock({ lockPath })) {
      return acquireDirectoryLock({
        lockPath,
        startedAt: Date.now(),
        timing,
      });
    }
    throw new Error(
      `Timed out waiting for cache publication lock: ${lockPath}`,
    );
  }
  await delay(timing.retryMs ?? LOCK_RETRY_MS);
  return acquireDirectoryLock({ lockPath, startedAt, timing });
}

export async function withAtomicPublishLock<Result>({
  action,
  lockPath,
  timing = {},
}: {
  action: () => Promise<Result>;
  lockPath: string;
  timing?: AtomicPublishLockTiming;
}) {
  const release = await acquireDirectoryLock({
    lockPath,
    startedAt: Date.now(),
    timing,
  });
  try {
    return await action();
  } finally {
    await release();
  }
}
