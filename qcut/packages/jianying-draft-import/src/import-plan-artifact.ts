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
	});
	const blockerFingerprints = collectInteropIssueFingerprints({
		issues: document.issues,
		severity: "error",
	});
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
		restricted: { rootRealPath: snapshot.rootRealPath },
		sourceFiles: Object.freeze(sourceFiles),
	};
}

export type ImportPlanInvalidReason =
	| "schema-mismatch"
	| "build-mismatch"
	| "expired";

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
