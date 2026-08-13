/**
 * Import plan artifact (JYI-007).
 *
 * A plan artifact is the persistable, expiring, source-bound result of an
 * inspect/plan pass. It mirrors the exporter's trusted-plan contract:
 * commit requires the same build, the same interop schema, an unexpired
 * token, and exact acceptance of the planned warning fingerprints — never
 * a re-derivation at commit time.
 *
 * The artifact deliberately splits RESTRICTED data (the absolute draft
 * root) from loggable data; `redactImportPlanArtifactForLog` is the ONLY
 * shape that may reach logs, CLI output, or evidence.
 *
 * @module @qcut/jianying-draft-import/import-plan-artifact
 */

import { createHash, randomBytes } from "node:crypto";
import { isAbsolute } from "node:path";
import {
	collectInteropIssueFingerprints,
	createInteropIssueFingerprint,
	type DraftInteropDocumentV1,
	type InteropIssue,
} from "@qcut/editor-core/draft-interop";
import type { DraftSourceSnapshot } from "./snapshot-reader.js";

export const IMPORT_PLAN_ARTIFACT_SCHEMA_VERSION = 1 as const;

/** Identity of the QCut build a plan is bound to. */
export interface ImportPlanBuildIdentity {
	appVersion: string;
	interopSchemaVersion: number;
}

export type ImportPlanDetectionOutcome =
	| "exact"
	| "ambiguous"
	| "unsupported"
	| "encrypted";

export interface ImportPlanArtifactV1 {
	schemaVersion: typeof IMPORT_PLAN_ARTIFACT_SCHEMA_VERSION;
	planToken: string;
	createdAtUnixMilliseconds: number;
	expiresAtUnixMilliseconds: number;
	buildIdentity: ImportPlanBuildIdentity;
	profileId?: string;
	detectionOutcome: ImportPlanDetectionOutcome;
	/** exact detection AND zero blocking issues. */
	canCommit: boolean;
	/** Binds the plan to source identities, profile, and build. */
	requestFingerprint: string;
	issueSetFingerprint: string;
	warningFingerprints: readonly string[];
	blockerFingerprints: readonly string[];
	/**
	 * RESTRICTED: absolute draft root needed to re-verify the source at
	 * commit. Never serialize this into logs, CLI output, or evidence —
	 * always pass through `redactImportPlanArtifactForLog` first.
	 */
	restricted: { rootRealPath: string };
	/** Relative-path snapshot manifest the plan is bound to. */
	sourceFiles: readonly {
		relativePath: string;
		sha256: string;
		byteLength: number;
	}[];
}

/** Loggable projection: the restricted block is structurally absent. */
export type RedactedImportPlanArtifact = Omit<
	ImportPlanArtifactV1,
	"restricted"
>;

const DEFAULT_PLAN_TTL_MILLISECONDS = 5 * 60 * 1000;
export const MAX_PLAN_TTL_MILLISECONDS = 24 * 60 * 60 * 1000;

function createSha256({ value }: { value: string }): string {
	return createHash("sha256").update(value).digest("hex");
}

function createIssueSetFingerprint({
	issues,
}: {
	issues: readonly InteropIssue[];
}): string {
	const identities = issues
		.map(
			(issue) =>
				`${issue.severity}\u001e${createInteropIssueFingerprint({ issue })}`
		)
		.sort();
	return createSha256({ value: identities.join("\u001d") });
}

function createResourceEvidence({
	document,
}: {
	document: DraftInteropDocumentV1;
}): readonly Record<string, unknown>[] {
	return [...document.resources]
		.sort((left, right) =>
			left.id < right.id ? -1 : left.id > right.id ? 1 : 0
		)
		.map((resource) => ({
			byteLength: resource.byteLength ?? null,
			capability: resource.capability,
			durationUs: resource.durationUs ?? null,
			foreignRef: resource.foreignRef ?? null,
			id: resource.id,
			kind: resource.kind,
			name: resource.name ?? null,
			originHint: resource.originHint ?? null,
			sha256: resource.sha256 ?? null,
			status: resource.status,
		}));
}

export function createImportPlanToken(): string {
	return randomBytes(32).toString("base64url");
}

/**
 * Builds a plan artifact from an inspect pass. `nowUnixMilliseconds` is a
 * parameter (not a clock read) so artifacts stay deterministic in tests.
 */
export function createImportPlanArtifact({
	snapshot,
	document,
	detectionOutcome,
	profileId,
	buildIdentity,
	nowUnixMilliseconds,
	planTtlMilliseconds = DEFAULT_PLAN_TTL_MILLISECONDS,
	planToken = createImportPlanToken(),
}: {
	snapshot: DraftSourceSnapshot;
	document: DraftInteropDocumentV1;
	detectionOutcome: ImportPlanDetectionOutcome;
	profileId?: string;
	buildIdentity: ImportPlanBuildIdentity;
	nowUnixMilliseconds: number;
	planTtlMilliseconds?: number;
	planToken?: string;
}): ImportPlanArtifactV1 {
	if (
		!Number.isSafeInteger(planTtlMilliseconds) ||
		planTtlMilliseconds < 1 ||
		planTtlMilliseconds > MAX_PLAN_TTL_MILLISECONDS
	) {
		throw new Error(
			`Import planTtlMilliseconds must be an integer between 1 and ${MAX_PLAN_TTL_MILLISECONDS}.`
		);
	}
	const warningFingerprints = collectInteropIssueFingerprints({
		issues: document.issues,
		severity: "warning",
	}).map((fingerprint) => createSha256({ value: fingerprint }));
	const blockerFingerprints = collectInteropIssueFingerprints({
		issues: document.issues,
		severity: "error",
	}).map((fingerprint) => createSha256({ value: fingerprint }));
	const sourceFiles = snapshot.files.map((file) => ({
		relativePath: file.relativePath,
		sha256: file.sha256,
		byteLength: file.byteLength,
	}));
	const requestFingerprint = createSha256({
		value: JSON.stringify({
			buildIdentity,
			detectionOutcome,
			identities: snapshot.files.map((file) => ({
				identity: file.identity,
				relativePath: file.relativePath,
				sha256: file.sha256,
			})),
			profileId: profileId ?? null,
			requestedRootRealPath:
				snapshot.requestedRootRealPath ?? snapshot.rootRealPath,
			resources: createResourceEvidence({ document }),
			rootRealPath: snapshot.rootRealPath,
		}),
	});
	return {
		schemaVersion: IMPORT_PLAN_ARTIFACT_SCHEMA_VERSION,
		planToken,
		createdAtUnixMilliseconds: nowUnixMilliseconds,
		expiresAtUnixMilliseconds: nowUnixMilliseconds + planTtlMilliseconds,
		buildIdentity: { ...buildIdentity },
		...(profileId === undefined ? {} : { profileId }),
		detectionOutcome,
		canCommit: detectionOutcome === "exact" && blockerFingerprints.length === 0,
		requestFingerprint,
		issueSetFingerprint: createIssueSetFingerprint({
			issues: document.issues,
		}),
		warningFingerprints: Object.freeze([...warningFingerprints]),
		blockerFingerprints: Object.freeze([...blockerFingerprints]),
		restricted: {
			rootRealPath: snapshot.requestedRootRealPath ?? snapshot.rootRealPath,
		},
		sourceFiles: Object.freeze(sourceFiles),
	};
}

export type ImportPlanInvalidReason =
	| "schema-mismatch"
	| "build-mismatch"
	| "expired";

export class ImportPlanArtifactMalformedError extends Error {
	readonly path: string;

	constructor({ message, path }: { message: string; path: string }) {
		super(`${path}: ${message}`);
		this.name = "ImportPlanArtifactMalformedError";
		this.path = path;
	}
}

function malformed({
	message,
	path,
}: {
	message: string;
	path: string;
}): never {
	throw new ImportPlanArtifactMalformedError({ message, path });
}

function asRecord({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		malformed({ message: "expected an object", path });
	}
	return value as Record<string, unknown>;
}

function assertExactKeys({
	record,
	required,
	optional = [],
	path,
}: {
	record: Record<string, unknown>;
	required: readonly string[];
	optional?: readonly string[];
	path: string;
}): void {
	const allowed = new Set([...required, ...optional]);
	for (const key of Object.keys(record)) {
		if (!allowed.has(key)) {
			malformed({ message: `unexpected field ${key}`, path: `${path}/${key}` });
		}
	}
	for (const key of required) {
		if (!(key in record)) {
			malformed({ message: "missing required field", path: `${path}/${key}` });
		}
	}
}

function asString({
	value,
	path,
	maxLength = 16_384,
}: {
	value: unknown;
	path: string;
	maxLength?: number;
}): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > maxLength ||
		value.includes("\0")
	) {
		malformed({ message: "expected a bounded non-empty string", path });
	}
	return value;
}

function asNonNegativeSafeInteger({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		malformed({ message: "expected a non-negative safe integer", path });
	}
	return value;
}

function asSha256({ value, path }: { value: unknown; path: string }): string {
	const digest = asString({ value, path, maxLength: 64 });
	if (!/^[a-f0-9]{64}$/u.test(digest)) {
		malformed({ message: "expected a lowercase SHA-256 digest", path });
	}
	return digest;
}

function asFingerprintArray({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): readonly string[] {
	if (!Array.isArray(value)) {
		malformed({ message: "expected an array", path });
	}
	const fingerprints = value.map((entry, index) =>
		asSha256({ value: entry, path: `${path}/${index}` })
	);
	if (new Set(fingerprints).size !== fingerprints.length) {
		malformed({ message: "duplicate fingerprints are not allowed", path });
	}
	return Object.freeze(fingerprints);
}

function isSafeRelativePath({
	relativePath,
}: {
	relativePath: string;
}): boolean {
	if (isAbsolute(relativePath) || relativePath.includes("\\")) {
		return false;
	}
	const parts = relativePath.split("/");
	return parts.every(
		(part) => part.length > 0 && part !== "." && part !== ".."
	);
}

/** Parses persisted JSON without trusting its TypeScript shape. */
export function parseImportPlanArtifactV1(
	value: unknown
): ImportPlanArtifactV1 {
	const path = "$";
	const record = asRecord({ value, path });
	assertExactKeys({
		record,
		required: [
			"schemaVersion",
			"planToken",
			"createdAtUnixMilliseconds",
			"expiresAtUnixMilliseconds",
			"buildIdentity",
			"detectionOutcome",
			"canCommit",
			"requestFingerprint",
			"issueSetFingerprint",
			"warningFingerprints",
			"blockerFingerprints",
			"restricted",
			"sourceFiles",
		],
		optional: ["profileId"],
		path,
	});
	if (record.schemaVersion !== IMPORT_PLAN_ARTIFACT_SCHEMA_VERSION) {
		malformed({
			message: "unsupported schema version",
			path: "$/schemaVersion",
		});
	}

	const buildRecord = asRecord({
		value: record.buildIdentity,
		path: "$/buildIdentity",
	});
	assertExactKeys({
		record: buildRecord,
		required: ["appVersion", "interopSchemaVersion"],
		path: "$/buildIdentity",
	});
	const buildIdentity: ImportPlanBuildIdentity = {
		appVersion: asString({
			value: buildRecord.appVersion,
			path: "$/buildIdentity/appVersion",
			maxLength: 256,
		}),
		interopSchemaVersion: asNonNegativeSafeInteger({
			value: buildRecord.interopSchemaVersion,
			path: "$/buildIdentity/interopSchemaVersion",
		}),
	};

	const detectionOutcomes: readonly ImportPlanDetectionOutcome[] = [
		"exact",
		"ambiguous",
		"unsupported",
		"encrypted",
	];
	if (
		!detectionOutcomes.includes(
			record.detectionOutcome as ImportPlanDetectionOutcome
		)
	) {
		malformed({
			message: "unknown detection outcome",
			path: "$/detectionOutcome",
		});
	}
	const detectionOutcome =
		record.detectionOutcome as ImportPlanDetectionOutcome;
	if (typeof record.canCommit !== "boolean") {
		malformed({ message: "expected a boolean", path: "$/canCommit" });
	}
	const warningFingerprints = asFingerprintArray({
		value: record.warningFingerprints,
		path: "$/warningFingerprints",
	});
	const blockerFingerprints = asFingerprintArray({
		value: record.blockerFingerprints,
		path: "$/blockerFingerprints",
	});
	const canCommit = record.canCommit;
	if (
		canCommit !==
		(detectionOutcome === "exact" && blockerFingerprints.length === 0)
	) {
		malformed({
			message: "value disagrees with detection outcome or blockers",
			path: "$/canCommit",
		});
	}

	const restrictedRecord = asRecord({
		value: record.restricted,
		path: "$/restricted",
	});
	assertExactKeys({
		record: restrictedRecord,
		required: ["rootRealPath"],
		path: "$/restricted",
	});
	const rootRealPath = asString({
		value: restrictedRecord.rootRealPath,
		path: "$/restricted/rootRealPath",
	});
	if (!isAbsolute(rootRealPath)) {
		malformed({
			message: "expected an absolute path",
			path: "$/restricted/rootRealPath",
		});
	}

	if (!Array.isArray(record.sourceFiles)) {
		malformed({ message: "expected an array", path: "$/sourceFiles" });
	}
	const seenPaths = new Set<string>();
	const sourceFiles = record.sourceFiles.map((entry, index) => {
		const entryPath = `$/sourceFiles/${index}`;
		const sourceRecord = asRecord({ value: entry, path: entryPath });
		assertExactKeys({
			record: sourceRecord,
			required: ["relativePath", "sha256", "byteLength"],
			path: entryPath,
		});
		const relativePath = asString({
			value: sourceRecord.relativePath,
			path: `${entryPath}/relativePath`,
		});
		if (!isSafeRelativePath({ relativePath }) || seenPaths.has(relativePath)) {
			malformed({
				message: "expected a unique safe relative path",
				path: `${entryPath}/relativePath`,
			});
		}
		seenPaths.add(relativePath);
		return {
			relativePath,
			sha256: asSha256({
				value: sourceRecord.sha256,
				path: `${entryPath}/sha256`,
			}),
			byteLength: asNonNegativeSafeInteger({
				value: sourceRecord.byteLength,
				path: `${entryPath}/byteLength`,
			}),
		};
	});

	const createdAtUnixMilliseconds = asNonNegativeSafeInteger({
		value: record.createdAtUnixMilliseconds,
		path: "$/createdAtUnixMilliseconds",
	});
	const expiresAtUnixMilliseconds = asNonNegativeSafeInteger({
		value: record.expiresAtUnixMilliseconds,
		path: "$/expiresAtUnixMilliseconds",
	});
	if (expiresAtUnixMilliseconds <= createdAtUnixMilliseconds) {
		malformed({
			message: "must be later than creation time",
			path: "$/expiresAtUnixMilliseconds",
		});
	}

	return {
		schemaVersion: IMPORT_PLAN_ARTIFACT_SCHEMA_VERSION,
		planToken: asString({
			value: record.planToken,
			path: "$/planToken",
			maxLength: 256,
		}),
		createdAtUnixMilliseconds,
		expiresAtUnixMilliseconds,
		buildIdentity,
		...(record.profileId === undefined
			? {}
			: {
					profileId: asString({
						value: record.profileId,
						path: "$/profileId",
						maxLength: 256,
					}),
				}),
		detectionOutcome,
		canCommit,
		requestFingerprint: asSha256({
			value: record.requestFingerprint,
			path: "$/requestFingerprint",
		}),
		issueSetFingerprint: asSha256({
			value: record.issueSetFingerprint,
			path: "$/issueSetFingerprint",
		}),
		warningFingerprints,
		blockerFingerprints,
		restricted: { rootRealPath },
		sourceFiles: Object.freeze(sourceFiles),
	};
}

/**
 * Revalidates a (possibly persisted) artifact against the current build
 * and clock. Fail-closed: any mismatch invalidates the whole plan.
 */
export function validateImportPlanArtifact({
	artifact,
	buildIdentity,
	nowUnixMilliseconds,
}: {
	artifact: ImportPlanArtifactV1;
	buildIdentity: ImportPlanBuildIdentity;
	nowUnixMilliseconds: number;
}): ImportPlanInvalidReason[] {
	const reasons: ImportPlanInvalidReason[] = [];
	if (artifact.schemaVersion !== IMPORT_PLAN_ARTIFACT_SCHEMA_VERSION) {
		reasons.push("schema-mismatch");
	}
	if (
		artifact.buildIdentity.appVersion !== buildIdentity.appVersion ||
		artifact.buildIdentity.interopSchemaVersion !==
			buildIdentity.interopSchemaVersion
	) {
		reasons.push("build-mismatch");
	}
	if (artifact.expiresAtUnixMilliseconds <= nowUnixMilliseconds) {
		reasons.push("expired");
	}
	return reasons;
}

/**
 * The only artifact shape allowed near logs/CLI/evidence: the restricted
 * block is removed structurally, not blanked.
 */
export function redactImportPlanArtifactForLog({
	artifact,
}: {
	artifact: ImportPlanArtifactV1;
}): RedactedImportPlanArtifact {
	const { restricted: _restricted, ...loggable } = artifact;
	return JSON.parse(JSON.stringify(loggable)) as RedactedImportPlanArtifact;
}
