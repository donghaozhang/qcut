/**
 * Semantic round-trip diff case runner (JYI-017, offline half).
 *
 * Normalizes two local draft directories — typically the original source
 * and a re-saved / re-exported copy — through the SAME pipeline the import
 * feature uses, diffs the semantic documents with the profile's half-frame
 * threshold, and writes a hash-bound evidence manifest. Read-only; no
 * QCut state and no absolute path ever enters the manifest.
 *
 * Usage:
 *   bun scripts/capcut-e2e/semantic-diff.ts \
 *     --left <draft-dir> --right <draft-dir> [--output <dir>] [--json]
 *
 * Exit codes: 0 identical/tolerable, 1 breaking differences, 2 not
 * comparable (profile not exact on either side).
 */

import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SEMANTIC_DIFF_MANIFEST_SCHEMA = "qcut.capcut-e2e.semantic-diff";
export const SEMANTIC_DIFF_MANIFEST_FILE_NAME = "semantic-diff-manifest.json";

export interface SemanticDiffSideEvidence {
	outcome: string;
	profileId?: string;
	files: Array<{ relativePath: string; byteLength: number; sha256: string }>;
}

export interface SemanticDiffCaseManifest {
	schema: typeof SEMANTIC_DIFF_MANIFEST_SCHEMA;
	schemaVersion: 1;
	generatedAtIso: string;
	options: { timeToleranceUs: number; speedTolerance: number };
	left: SemanticDiffSideEvidence;
	right: SemanticDiffSideEvidence;
	verdict: "identical" | "tolerable" | "breaking" | "not-comparable";
	diff?: unknown;
	notComparableReason?: string;
}

export interface ImportPipelineApi {
	discoverDraftDirectory: (options: {
		draftDirectory: string;
	}) => Promise<{ rootRealPath: string; files: unknown[] }>;
	readDraftSourceSnapshot: (options: {
		rootRealPath: string;
		files: unknown[];
	}) => Promise<{
		rootRealPath: string;
		files: Array<{
			relativePath: string;
			byteLength: number;
			sha256: string;
			role: string;
			classification: string;
			identity: unknown;
		}>;
		parsedJsonByPath: Record<string, unknown>;
		issues: unknown[];
	}>;
	buildContentSummary: (options: {
		snapshot: unknown;
	}) => { fileName: string; [key: string]: unknown } | undefined;
}

export interface EditorCoreApi {
	detectDraftProfile: (options: {
		files: unknown[];
		contentSummary?: unknown;
	}) => { outcome: string; profileId?: string };
	getDraftProfile: (options: {
		profileId: string;
	}) => { product: "jianying" | "capcut" } | null;
	normalizeRawDraft: (options: {
		content: Record<string, unknown>;
		source: unknown;
		contentFileName: string;
	}) => { document: DiffableDocument };
	diffDraftInteropDocuments: (options: {
		left: DiffableDocument;
		right: DiffableDocument;
		options?: { timeToleranceUs?: number; speedTolerance?: number };
	}) => {
		identical: boolean;
		breakingCount: number;
		tolerableCount: number;
		infoCount: number;
		entries: unknown[];
	};
	halfFrameToleranceUs: (options: { fps: number }) => number;
}

export interface DiffableDocument {
	project: { durationUs?: number; fps: number };
	timelines: Array<{
		isRoot: boolean;
		tracks: Array<{
			segments: Array<{
				id: string;
				kind: string;
				targetRange: { durationUs: number; startUs: number };
			}>;
			transitions?: Array<{
				durationUs: number;
				fromSegmentId: string;
				id: string;
				toSegmentId: string;
			}>;
		}>;
	}>;
	[key: string]: unknown;
}

// Scripts are always invoked from the repo root (harness convention).
const PROJECT_ROOT = resolve(process.cwd());

function findRepoRoot(): string {
	return PROJECT_ROOT;
}

async function loadModule<Shape>({
	relativePath,
	required,
}: {
	relativePath: string;
	required: string[];
}): Promise<Shape> {
	const absolutePath = join(findRepoRoot(), relativePath);
	const moduleValue = (await import(
		pathToFileURL(absolutePath).href
	)) as Record<string, unknown>;
	for (const exportName of required) {
		if (typeof moduleValue[exportName] !== "function") {
			throw new Error(`${relativePath} does not export ${exportName}.`);
		}
	}
	return moduleValue as Shape;
}

export async function loadSemanticDiffApi(): Promise<
	ImportPipelineApi & EditorCoreApi
> {
	const [importIndex, editorIndexJianying, editorIndexInterop] =
		await Promise.all([
			loadModule<ImportPipelineApi>({
				relativePath: "packages/jianying-draft-import/src/index.ts",
				required: [
					"discoverDraftDirectory",
					"readDraftSourceSnapshot",
					"buildContentSummary",
				],
			}),
			loadModule<EditorCoreApi>({
				relativePath: "packages/editor-core/src/jianying-draft/index.ts",
				required: [
					"detectDraftProfile",
					"getDraftProfile",
					"normalizeRawDraft",
				],
			}),
			loadModule<EditorCoreApi>({
				relativePath: "packages/editor-core/src/draft-interop/index.ts",
				required: ["diffDraftInteropDocuments", "halfFrameToleranceUs"],
			}),
		]);
	return { ...importIndex, ...editorIndexJianying, ...editorIndexInterop };
}

export interface NormalizedSemanticDiffSide {
	evidence: SemanticDiffSideEvidence;
	document?: DiffableDocument;
}

async function normalizeSide({
	api,
	draftDirectory,
}: {
	api: ImportPipelineApi & EditorCoreApi;
	draftDirectory: string;
}): Promise<NormalizedSemanticDiffSide> {
	const discovery = await api.discoverDraftDirectory({ draftDirectory });
	const snapshot = await api.readDraftSourceSnapshot({
		rootRealPath: discovery.rootRealPath,
		files: discovery.files,
	});
	const summary = api.buildContentSummary({ snapshot });
	const detection = api.detectDraftProfile({
		files: snapshot.files,
		...(summary === undefined ? {} : { contentSummary: summary }),
	});
	const evidence: SemanticDiffSideEvidence = {
		outcome: detection.outcome,
		...(detection.profileId === undefined
			? {}
			: { profileId: detection.profileId }),
		files: snapshot.files
			.map(({ relativePath, byteLength, sha256 }) => ({
				relativePath,
				byteLength,
				sha256,
			}))
			.sort((left, right) =>
				left.relativePath.localeCompare(right.relativePath)
			),
	};
	if (
		detection.outcome !== "exact" ||
		detection.profileId === undefined ||
		summary === undefined
	) {
		return { evidence };
	}
	const profile = api.getDraftProfile({ profileId: detection.profileId });
	const normalized = api.normalizeRawDraft({
		content: snapshot.parsedJsonByPath[summary.fileName] as Record<
			string,
			unknown
		>,
		source: {
			product: profile?.product ?? "jianying",
			profileId: detection.profileId,
			platform: "macos",
			files: snapshot.files.map(({ identity: _identity, ...file }) => file),
		},
		contentFileName: summary.fileName,
	});
	return { evidence, document: normalized.document };
}

export async function normalizeDraftForSemanticDiff({
	api,
	draftDirectory,
}: {
	api?: ImportPipelineApi & EditorCoreApi;
	draftDirectory: string;
}): Promise<NormalizedSemanticDiffSide> {
	const loadedApi = api ?? (await loadSemanticDiffApi());
	return normalizeSide({ api: loadedApi, draftDirectory });
}

export function buildSemanticDiffCaseManifest({
	api,
	left,
	nowIso,
	right,
}: {
	api: ImportPipelineApi & EditorCoreApi;
	left: NormalizedSemanticDiffSide;
	nowIso: string;
	right: NormalizedSemanticDiffSide;
}): SemanticDiffCaseManifest {
	if (left.document === undefined || right.document === undefined) {
		return {
			schema: SEMANTIC_DIFF_MANIFEST_SCHEMA,
			schemaVersion: 1,
			generatedAtIso: nowIso,
			options: { timeToleranceUs: 0, speedTolerance: 0 },
			left: left.evidence,
			right: right.evidence,
			verdict: "not-comparable",
			notComparableReason:
				left.document === undefined
					? `left side is ${left.evidence.outcome}`
					: `right side is ${right.evidence.outcome}`,
		};
	}
	const timeToleranceUs = api.halfFrameToleranceUs({
		fps: left.document.project.fps,
	});
	const options = { timeToleranceUs, speedTolerance: 0 };
	const diff = api.diffDraftInteropDocuments({
		left: left.document,
		right: right.document,
		options,
	});
	return {
		schema: SEMANTIC_DIFF_MANIFEST_SCHEMA,
		schemaVersion: 1,
		generatedAtIso: nowIso,
		options,
		left: left.evidence,
		right: right.evidence,
		verdict: diff.identical
			? "identical"
			: diff.breakingCount > 0
				? "breaking"
				: "tolerable",
		diff,
	};
}

export async function runSemanticDiffCase({
	leftDraftDirectory,
	rightDraftDirectory,
	outputDirectory,
	nowIso = new Date().toISOString(),
	api,
}: {
	leftDraftDirectory: string;
	rightDraftDirectory: string;
	outputDirectory?: string;
	nowIso?: string;
	api?: ImportPipelineApi & EditorCoreApi;
}): Promise<SemanticDiffCaseManifest> {
	const loadedApi = api ?? (await loadSemanticDiffApi());
	const [left, right] = await Promise.all([
		normalizeSide({ api: loadedApi, draftDirectory: leftDraftDirectory }),
		normalizeSide({ api: loadedApi, draftDirectory: rightDraftDirectory }),
	]);

	const manifest = buildSemanticDiffCaseManifest({
		api: loadedApi,
		left,
		nowIso,
		right,
	});

	if (outputDirectory !== undefined) {
		await writeFile(
			join(outputDirectory, SEMANTIC_DIFF_MANIFEST_FILE_NAME),
			`${JSON.stringify(manifest, null, 2)}\n`,
			{ encoding: "utf8", flag: "wx", mode: 0o600 }
		);
	}
	return manifest;
}

function readCliFlagValue({
	argv,
	flag,
	index,
}: {
	argv: string[];
	flag: string;
	index: number;
}): string {
	const value = argv[index + 1];
	if (value === undefined || value.startsWith("--")) {
		throw new Error(`Missing value for ${flag}`);
	}
	return value;
}

export function parseSemanticDiffCliOptions({ argv }: { argv: string[] }): {
	leftDraftDirectory: string;
	rightDraftDirectory: string;
	outputDirectory?: string;
	json: boolean;
} {
	let left: string | undefined;
	let right: string | undefined;
	let output: string | undefined;
	let json = false;
	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index];
		if (flag === "--json") {
			json = true;
			continue;
		}
		if (flag === "--left" || flag === "--right" || flag === "--output") {
			const value = readCliFlagValue({ argv, flag, index });
			index += 1;
			if (flag === "--left") left = value;
			if (flag === "--right") right = value;
			if (flag === "--output") output = value;
			continue;
		}
		throw new Error(`Unknown flag: ${flag}`);
	}
	if (left === undefined || right === undefined) {
		throw new Error(
			"Usage: semantic-diff.ts --left <draft-dir> --right <draft-dir> [--output <dir>] [--json]"
		);
	}
	return {
		leftDraftDirectory: left,
		rightDraftDirectory: right,
		...(output === undefined ? {} : { outputDirectory: output }),
		json,
	};
}

async function main(): Promise<void> {
	const options = parseSemanticDiffCliOptions({ argv: process.argv.slice(2) });
	const manifest = await runSemanticDiffCase(options);
	if (options.json) {
		console.log(JSON.stringify(manifest, null, 2));
	} else {
		console.log(
			`verdict: ${manifest.verdict}` +
				(manifest.verdict === "not-comparable"
					? ` (${manifest.notComparableReason})`
					: "")
		);
	}
	if (manifest.verdict === "breaking") process.exitCode = 1;
	if (manifest.verdict === "not-comparable") process.exitCode = 2;
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
const expectedEntryPath = join(
	PROJECT_ROOT,
	"scripts",
	"capcut-e2e",
	"semantic-diff.ts"
);
if (entryPath === expectedEntryPath) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 2;
	});
}
