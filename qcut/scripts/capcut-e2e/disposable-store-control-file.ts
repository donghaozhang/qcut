import { constants as fileSystemConstants, type BigIntStats } from "node:fs";
import { lstat, open } from "node:fs/promises";

const MAXIMUM_CONTROL_FILE_BYTES = 1024 * 1024;

export interface RegularFileSnapshot {
	bytes: Buffer;
	identity: {
		device: bigint;
		inode: bigint;
		modifiedAtNanoseconds: bigint;
		size: bigint;
	};
	modifiedAtMilliseconds: number;
}

function isMissingPathError({ error }: { error: unknown }): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}

export async function requirePathStats({
	label,
	path,
}: {
	label: string;
	path: string;
}): Promise<BigIntStats> {
	try {
		return await lstat(path, { bigint: true });
	} catch (error) {
		if (isMissingPathError({ error })) {
			throw new Error(`${label} is required.`);
		}
		throw error;
	}
}

function isSameFileIdentity({
	left,
	right,
}: {
	left: BigIntStats;
	right: BigIntStats;
}): boolean {
	return (
		left.dev === right.dev &&
		left.ino === right.ino &&
		left.mtimeNs === right.mtimeNs &&
		left.size === right.size
	);
}

export async function readRegularFileSnapshot({
	label,
	path,
}: {
	label: string;
	path: string;
}): Promise<RegularFileSnapshot> {
	const pathStatsBeforeOpen = await requirePathStats({ label, path });
	if (pathStatsBeforeOpen.isSymbolicLink()) {
		throw new Error(`${label} must not be a symbolic link.`);
	}
	if (!pathStatsBeforeOpen.isFile()) {
		throw new Error(`${label} must be a regular file.`);
	}

	const noFollowFlag =
		typeof fileSystemConstants.O_NOFOLLOW === "number"
			? fileSystemConstants.O_NOFOLLOW
			: 0;
	const fileHandle = await open(
		path,
		fileSystemConstants.O_RDONLY | noFollowFlag
	);
	let openedStats: BigIntStats;
	let bytes: Buffer;
	try {
		openedStats = await fileHandle.stat({ bigint: true });
		if (!openedStats.isFile()) {
			throw new Error(`${label} must be a regular file.`);
		}
		if (openedStats.size > BigInt(MAXIMUM_CONTROL_FILE_BYTES)) {
			throw new Error(`${label} exceeds ${MAXIMUM_CONTROL_FILE_BYTES} bytes.`);
		}
		if (
			!isSameFileIdentity({ left: pathStatsBeforeOpen, right: openedStats })
		) {
			throw new Error(`${label} changed during preflight.`);
		}
		bytes = await fileHandle.readFile();
		const statsAfterRead = await fileHandle.stat({ bigint: true });
		if (!isSameFileIdentity({ left: openedStats, right: statsAfterRead })) {
			throw new Error(`${label} changed during preflight.`);
		}
	} finally {
		await fileHandle.close();
	}

	const pathStatsAfterRead = await requirePathStats({ label, path });
	if (
		pathStatsAfterRead.isSymbolicLink() ||
		!isSameFileIdentity({ left: openedStats, right: pathStatsAfterRead })
	) {
		throw new Error(`${label} changed during preflight.`);
	}
	if (BigInt(bytes.length) !== openedStats.size) {
		throw new Error(`${label} changed during preflight.`);
	}

	return {
		bytes,
		identity: {
			device: openedStats.dev,
			inode: openedStats.ino,
			modifiedAtNanoseconds: openedStats.mtimeNs,
			size: openedStats.size,
		},
		modifiedAtMilliseconds: Number(openedStats.mtimeNs) / 1_000_000,
	};
}

export function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be a JSON object.`);
	}
	return value as Record<string, unknown>;
}

export function parseJsonRecord({
	bytes,
	label,
}: {
	bytes: Buffer;
	label: string;
}): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(bytes.toString("utf8"));
	} catch {
		throw new Error(`${label} must contain valid JSON.`);
	}
	return requireRecord({ label, value: parsed });
}

export function assertExactKeys({
	expectedKeys,
	label,
	value,
}: {
	expectedKeys: string[];
	label: string;
	value: Record<string, unknown>;
}): void {
	const actualKeys = Object.keys(value).sort();
	const sortedExpectedKeys = [...expectedKeys].sort();
	if (
		actualKeys.length !== sortedExpectedKeys.length ||
		actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
	) {
		throw new Error(
			`${label} must contain exactly: ${sortedExpectedKeys.join(", ")}.`
		);
	}
}
