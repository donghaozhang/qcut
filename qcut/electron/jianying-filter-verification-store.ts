import { createHash, randomUUID } from "node:crypto";
import {
	type FileHandle,
	mkdir,
	open,
	readFile,
	rename,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type {
	JianyingFilterVerification,
	JianyingFilterVerificationStatus,
} from "./jianying-filter-lab-contract.js";

/**
 * Schema v2 (FLP-004): records key on resourceId + version + inputDigest so
 * batch parity runs accumulate history instead of overwriting each other.
 * v1 stores (one record per resourceId) load transparently — their records
 * are kept as `inputDigest: "legacy"` entries and survive the next save.
 */
const STORE_SCHEMA_VERSION = 2;
const LEGACY_SCHEMA_VERSION = 1;
const COMPOSITE_KEY_SEPARATOR = "\u001f";
const STORE_LOCK_RETRY_MILLISECONDS = 10;
/** Errors that mean the lock file exists, across platforms. */
const STORE_LOCK_CONTENDED_CODES = new Set(["EEXIST", "EPERM", "EACCES"]);
const STORE_LOCK_TIMEOUT_MILLISECONDS = 10_000;
const STORE_LOCK_STALE_MILLISECONDS = 30_000;
const STORE_LOCK_HEARTBEAT_MILLISECONDS = 10_000;
export const LEGACY_INPUT_DIGEST = "legacy";

const STATUS_VALUES = new Set<JianyingFilterVerificationStatus>([
	"unverified",
	"close",
	"verified",
]);

export interface JianyingFilterVerificationRecord
	extends JianyingFilterVerification {
	resourceId: string;
	width: number;
	height: number;
	referenceSha256: string;
	candidateSha256: string;
	verifiedAt: string;
	/**
	 * Identifies the comparison input set (reference/candidate material).
	 * Defaults to a digest of the frame hashes on save; "legacy" marks
	 * records migrated from schema v1.
	 */
	inputDigest?: string;
}

interface VerificationStore {
	schemaVersion: typeof STORE_SCHEMA_VERSION;
	records: JianyingFilterVerificationRecord[];
}

interface VerificationStoreLock {
	device: string;
	handle: FileHandle;
	inode: string;
	lockPath: string;
}

export function getJianyingFilterVerificationStorePath() {
	return join(homedir(), ".qcut", "filter-lab", "verifications.json");
}

function isRecord({ value }: { value: unknown }): boolean {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	if (
		typeof record.resourceId !== "string" ||
		record.resourceId.length === 0 ||
		typeof record.status !== "string" ||
		!STATUS_VALUES.has(record.status as JianyingFilterVerificationStatus) ||
		!Number.isInteger(record.width) ||
		!Number.isInteger(record.height) ||
		Number(record.width) <= 0 ||
		Number(record.height) <= 0 ||
		typeof record.referenceSha256 !== "string" ||
		typeof record.candidateSha256 !== "string" ||
		typeof record.verifiedAt !== "string"
	) {
		return false;
	}
	if (
		record.inputDigest !== undefined &&
		(typeof record.inputDigest !== "string" || record.inputDigest.length === 0)
	) {
		return false;
	}
	const numericKeys = [
		"rgbRmse",
		"psnr",
		"ssim",
		"deltaE",
		"deltaESamples",
		"maskIou",
		"maskMae",
		"maskEdgeMae",
		"temporalFrameCount",
		"temporalRmse",
		"temporalRmseStdDev",
		"temporalRmseMax",
		"temporalMotionDelta",
	];
	return numericKeys.every(
		(key) => record[key] === undefined || Number.isFinite(record[key])
	);
}

function defaultInputDigest({
	record,
}: {
	record: JianyingFilterVerificationRecord;
}): string {
	return createHash("sha256")
		.update(record.referenceSha256)
		.update(":")
		.update(record.candidateSha256)
		.digest("hex")
		.slice(0, 16);
}

function compositeKey({
	record,
}: {
	record: JianyingFilterVerificationRecord;
}): string {
	return [
		record.resourceId,
		record.version ?? "",
		record.inputDigest ?? defaultInputDigest({ record }),
	].join(COMPOSITE_KEY_SEPARATOR);
}

function nodeErrorCode({ error }: { error: unknown }): string | undefined {
	return error && typeof error === "object" && "code" in error
		? String(error.code)
		: undefined;
}

async function discardStaleStoreLock({
	lockPath,
}: {
	lockPath: string;
}): Promise<boolean> {
	try {
		const lockStats = await stat(lockPath);
		if (Date.now() - lockStats.mtimeMs < STORE_LOCK_STALE_MILLISECONDS) {
			return false;
		}
		await unlink(lockPath);
		return true;
	} catch (error) {
		if (nodeErrorCode({ error }) === "ENOENT") return true;
		throw error;
	}
}

async function acquireStoreLock({
	deadline,
	lockPath,
}: {
	deadline: number;
	lockPath: string;
}): Promise<VerificationStoreLock> {
	let handle: FileHandle;
	try {
		handle = await open(lockPath, "wx", 0o600);
	} catch (error) {
		// "wx" reports an already-held lock as EEXIST on POSIX, but Windows
		// surfaces the same contention as EPERM/EACCES — treat all three as
		// "someone else holds it" so the stale-lock and retry paths below run
		// instead of failing the write outright.
		if (!STORE_LOCK_CONTENDED_CODES.has(nodeErrorCode({ error }) ?? "")) {
			throw error;
		}
		if (await discardStaleStoreLock({ lockPath })) {
			return acquireStoreLock({ deadline, lockPath });
		}
		if (Date.now() >= deadline) {
			throw new Error(
				`Timed out acquiring verification store lock: ${lockPath}`
			);
		}
		await delay(STORE_LOCK_RETRY_MILLISECONDS);
		return acquireStoreLock({ deadline, lockPath });
	}

	try {
		await handle.writeFile(
			JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })
		);
		await handle.sync();
		const identity = await handle.stat({ bigint: true });
		return {
			device: identity.dev.toString(),
			handle,
			inode: identity.ino.toString(),
			lockPath,
		};
	} catch (error) {
		await handle.close().catch(() => undefined);
		await unlink(lockPath).catch(() => undefined);
		throw error;
	}
}

async function releaseStoreLock({
	lock,
}: {
	lock: VerificationStoreLock;
}): Promise<void> {
	await lock.handle.close();
	try {
		const current = await stat(lock.lockPath, { bigint: true });
		if (
			current.dev.toString() !== lock.device ||
			current.ino.toString() !== lock.inode
		) {
			return;
		}
		await unlink(lock.lockPath);
	} catch (error) {
		if (nodeErrorCode({ error }) !== "ENOENT") throw error;
	}
}

async function withStoreLock<Result>({
	operation,
	storePath,
}: {
	operation: () => Promise<Result>;
	storePath: string;
}): Promise<Result> {
	await mkdir(dirname(storePath), { recursive: true, mode: 0o700 });
	const lock = await acquireStoreLock({
		deadline: Date.now() + STORE_LOCK_TIMEOUT_MILLISECONDS,
		lockPath: `${storePath}.lock`,
	});
	// Keep the lock file visibly fresh while the operation runs, so a
	// concurrent writer's stale-lock takeover (mtime older than
	// STORE_LOCK_STALE_MILLISECONDS) cannot fire mid-operation and let two
	// read-modify-write cycles overlap.
	const heartbeat = setInterval(() => {
		const now = new Date();
		void lock.handle.utimes(now, now).catch(() => undefined);
	}, STORE_LOCK_HEARTBEAT_MILLISECONDS);
	heartbeat.unref?.();
	try {
		return await operation();
	} finally {
		clearInterval(heartbeat);
		await releaseStoreLock({ lock });
	}
}

async function readStore({
	storePath,
}: {
	storePath: string;
}): Promise<VerificationStore> {
	let text: string;
	try {
		text = await readFile(storePath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { schemaVersion: STORE_SCHEMA_VERSION, records: [] };
		}
		throw error;
	}
	const parsed = JSON.parse(text) as unknown;
	if (!parsed || typeof parsed !== "object") {
		throw new Error("Filter Lab verification store is not an object");
	}
	const candidate = parsed as Record<string, unknown>;
	if (
		!Array.isArray(candidate.records) ||
		!candidate.records.every((record) => isRecord({ value: record }))
	) {
		throw new Error("Filter Lab verification store has an unsupported schema");
	}
	if (candidate.schemaVersion === STORE_SCHEMA_VERSION) {
		return candidate as unknown as VerificationStore;
	}
	if (candidate.schemaVersion === LEGACY_SCHEMA_VERSION) {
		// v1 kept one record per resourceId with no input identity. Preserve
		// them all as explicit legacy entries; nothing is dropped.
		const migrated = (
			candidate.records as JianyingFilterVerificationRecord[]
		).map((record) => ({
			...record,
			inputDigest: record.inputDigest ?? LEGACY_INPUT_DIGEST,
		}));
		return { schemaVersion: STORE_SCHEMA_VERSION, records: migrated };
	}
	throw new Error("Filter Lab verification store has an unsupported schema");
}

/**
 * Verification candidates per resourceId: the latest record for each
 * distinct version. The catalog join's version gate
 * (jianying-filter-verification-gate.ts) picks from these per card, so a
 * newer run against a different version can never mask the record that
 * matches the card's current version.
 */
export async function readJianyingFilterVerifications({
	storePath = getJianyingFilterVerificationStorePath(),
}: {
	storePath?: string;
} = {}): Promise<Map<string, JianyingFilterVerification[]>> {
	try {
		const store = await readStore({ storePath });
		const latestByResourceVersion = new Map<
			string,
			JianyingFilterVerificationRecord
		>();
		for (const record of store.records) {
			const key = [record.resourceId, record.version ?? ""].join(
				COMPOSITE_KEY_SEPARATOR
			);
			const existing = latestByResourceVersion.get(key);
			if (!existing || existing.verifiedAt <= record.verifiedAt) {
				latestByResourceVersion.set(key, record);
			}
		}
		const grouped = new Map<string, JianyingFilterVerification[]>();
		for (const record of latestByResourceVersion.values()) {
			const candidates = grouped.get(record.resourceId) ?? [];
			candidates.push({ ...record });
			grouped.set(record.resourceId, candidates);
		}
		for (const candidates of grouped.values()) {
			candidates.sort((left, right) =>
				(right.verifiedAt ?? "").localeCompare(left.verifiedAt ?? "")
			);
		}
		return grouped;
	} catch (error) {
		console.warn("[Filter Lab] Ignoring unreadable verification store", error);
		return new Map();
	}
}

/** Every recorded verification run, for coverage aggregation (FLP-004). */
export async function readJianyingFilterVerificationRecords({
	storePath = getJianyingFilterVerificationStorePath(),
}: {
	storePath?: string;
} = {}): Promise<JianyingFilterVerificationRecord[]> {
	try {
		const store = await readStore({ storePath });
		return store.records.map((record) => ({ ...record }));
	} catch (error) {
		console.warn("[Filter Lab] Ignoring unreadable verification store", error);
		return [];
	}
}

export async function saveJianyingFilterVerification({
	record,
	storePath = getJianyingFilterVerificationStorePath(),
}: {
	record: JianyingFilterVerificationRecord;
	storePath?: string;
}): Promise<string> {
	if (!isRecord({ value: record })) {
		throw new Error("Filter Lab verification record is invalid");
	}
	return withStoreLock({
		storePath,
		operation: async () => {
			const store = await readStore({ storePath });
			const stamped: JianyingFilterVerificationRecord = {
				...record,
				inputDigest: record.inputDigest ?? defaultInputDigest({ record }),
			};
			const key = compositeKey({ record: stamped });
			const records = store.records.filter(
				(existing) => compositeKey({ record: existing }) !== key
			);
			records.push(stamped);
			records.sort(
				(left, right) =>
					left.resourceId.localeCompare(right.resourceId) ||
					(left.version ?? "").localeCompare(right.version ?? "") ||
					(left.inputDigest ?? "").localeCompare(right.inputDigest ?? "") ||
					left.verifiedAt.localeCompare(right.verifiedAt)
			);
			const temporaryPath = `${storePath}.${process.pid}.${randomUUID()}.tmp`;
			try {
				await writeFile(
					temporaryPath,
					`${JSON.stringify({ schemaVersion: STORE_SCHEMA_VERSION, records }, null, 2)}\n`,
					{ encoding: "utf8", mode: 0o600 }
				);
				await rename(temporaryPath, storePath);
			} catch (error) {
				await unlink(temporaryPath).catch(() => undefined);
				throw error;
			}
			return storePath;
		},
	});
}
