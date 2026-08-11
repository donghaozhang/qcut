import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type {
	JianyingFilterVerification,
	JianyingFilterVerificationStatus,
} from "./jianying-filter-lab-contract.js";

const STORE_SCHEMA_VERSION = 1;
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
}

interface VerificationStore {
	schemaVersion: 1;
	records: JianyingFilterVerificationRecord[];
}

export function getJianyingFilterVerificationStorePath() {
	return join(homedir(), ".qcut", "filter-lab", "verifications.json");
}

function isRecord({
	value,
}: {
	value: unknown;
}): boolean {
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
		candidate.schemaVersion !== STORE_SCHEMA_VERSION ||
		!Array.isArray(candidate.records) ||
		!candidate.records.every((record) => isRecord({ value: record }))
	) {
		throw new Error("Filter Lab verification store has an unsupported schema");
	}
	return candidate as unknown as VerificationStore;
}

export async function readJianyingFilterVerifications({
	storePath = getJianyingFilterVerificationStorePath(),
}: {
	storePath?: string;
} = {}): Promise<Map<string, JianyingFilterVerification>> {
	try {
		const store = await readStore({ storePath });
		return new Map(
			store.records.map((record) => [record.resourceId, { ...record }])
		);
	} catch (error) {
		console.warn("[Filter Lab] Ignoring unreadable verification store", error);
		return new Map();
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
	const store = await readStore({ storePath });
	const records = store.records.filter(
		(existing) => existing.resourceId !== record.resourceId
	);
	records.push(record);
	records.sort((left, right) =>
		left.resourceId.localeCompare(right.resourceId)
	);
	await mkdir(dirname(storePath), { recursive: true, mode: 0o700 });
	const temporaryPath = `${storePath}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(
		temporaryPath,
		`${JSON.stringify({ schemaVersion: STORE_SCHEMA_VERSION, records }, null, 2)}\n`,
		{ encoding: "utf8", mode: 0o600 }
	);
	await rename(temporaryPath, storePath);
	return storePath;
}
