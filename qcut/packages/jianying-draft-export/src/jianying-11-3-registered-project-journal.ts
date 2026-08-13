import { rename } from "node:fs/promises";
import {
	JIANYING_11_3_PROFILE_IDS,
	type Jianying113ProfileId,
} from "@qcut/editor-core/jianying-draft";
import {
	failJianying113RegisteredProjectWriteback,
	Jianying113RegisteredProjectWritebackError,
} from "./jianying-11-3-registered-project-contract.js";
import {
	readRegularFile,
	SHA256_PATTERN,
	writeExclusiveFile,
} from "./jianying-11-3-registered-project-transaction.js";

export const JOURNAL_FILE_NAME = ".qcut-jianying-writeback-journal.json";
export const JOURNAL_SCHEMA =
	"qcut.jianying-11.3.registered-project-writeback-journal";
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CONTENT_RELATIVE_PATH_PATTERN =
	/^subdraft\/([^/]+)\/draft_content\.json$/u;

export interface Jianying113WritebackJournalV1 {
	committed: boolean;
	contentRelativePath: string;
	contentSha256: string;
	documentId: string;
	expectedSourceSha256: string;
	profileId: Jianying113ProfileId;
	schema: typeof JOURNAL_SCHEMA;
	schemaVersion: 1;
	subdraftId: string;
	transactionId: string;
}

function hasExactKeys({
	record,
	keys,
}: {
	record: Record<string, unknown>;
	keys: readonly string[];
}): boolean {
	const actual = Object.keys(record).sort();
	const expected = [...keys].sort();
	return (
		actual.length === expected.length &&
		actual.every((key, index) => key === expected[index])
	);
}

function parseJournal({
	value,
}: {
	value: unknown;
}): Jianying113WritebackJournalV1 {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		failJianying113RegisteredProjectWriteback({
			code: "RECOVERY_REQUIRED",
			message: "Jianying writeback journal is malformed.",
		});
	}
	const record = value as Record<string, unknown>;
	const profileId = JIANYING_11_3_PROFILE_IDS.find(
		(candidate) => candidate === record.profileId
	);
	if (
		!hasExactKeys({
			record,
			keys: [
				"committed",
				"contentRelativePath",
				"contentSha256",
				"documentId",
				"expectedSourceSha256",
				"profileId",
				"schema",
				"schemaVersion",
				"subdraftId",
				"transactionId",
			],
		}) ||
		record.schema !== JOURNAL_SCHEMA ||
		record.schemaVersion !== 1 ||
		typeof record.transactionId !== "string" ||
		!UUID_PATTERN.test(record.transactionId) ||
		typeof record.contentRelativePath !== "string" ||
		record.contentRelativePath.match(CONTENT_RELATIVE_PATH_PATTERN) === null ||
		typeof record.contentSha256 !== "string" ||
		!SHA256_PATTERN.test(record.contentSha256) ||
		typeof record.expectedSourceSha256 !== "string" ||
		!SHA256_PATTERN.test(record.expectedSourceSha256) ||
		typeof record.documentId !== "string" ||
		record.documentId.length === 0 ||
		profileId === undefined ||
		typeof record.subdraftId !== "string" ||
		record.subdraftId.length === 0 ||
		typeof record.committed !== "boolean"
	) {
		failJianying113RegisteredProjectWriteback({
			code: "RECOVERY_REQUIRED",
			message: "Jianying writeback journal is malformed.",
		});
	}
	return {
		committed: record.committed,
		contentRelativePath: record.contentRelativePath,
		contentSha256: record.contentSha256,
		documentId: record.documentId,
		expectedSourceSha256: record.expectedSourceSha256,
		profileId,
		schema: JOURNAL_SCHEMA,
		schemaVersion: 1,
		subdraftId: record.subdraftId,
		transactionId: record.transactionId,
	};
}

export async function readJournal({
	journalPath,
}: {
	journalPath: string;
}): Promise<Jianying113WritebackJournalV1> {
	const { bytes } = await readRegularFile({ path: journalPath });
	try {
		return parseJournal({
			value: JSON.parse(
				new TextDecoder("utf-8", { fatal: true }).decode(bytes)
			),
		});
	} catch (error) {
		if (error instanceof Jianying113RegisteredProjectWritebackError)
			throw error;
		failJianying113RegisteredProjectWriteback({
			code: "RECOVERY_REQUIRED",
			message: "Jianying writeback journal cannot be decoded.",
		});
	}
}

export async function writeJournal({
	journal,
	journalPath,
	replace,
}: {
	journal: Jianying113WritebackJournalV1;
	journalPath: string;
	replace: boolean;
}): Promise<void> {
	const bytes = new TextEncoder().encode(`${JSON.stringify(journal)}\n`);
	if (!replace) {
		await writeExclusiveFile({ bytes, path: journalPath });
		return;
	}
	const temporaryPath = `${journalPath}.${journal.transactionId}.next`;
	await writeExclusiveFile({ bytes, path: temporaryPath });
	await rename(temporaryPath, journalPath);
}
