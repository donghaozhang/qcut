import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PROJECT_ROOT = resolve(process.cwd());

export interface TimelineElement {
	id: string;
	type: string;
	duration: number;
	startTime: number;
	trimStart: number;
	trimEnd: number;
	playbackRate?: number;
}

export interface TimelineTrack {
	id: string;
	type: string;
	elements: TimelineElement[];
	[key: string]: unknown;
}

export interface CapCut81WritebackTimingSnapshot {
	tracks: readonly TimelineTrack[];
	timelineDurationByElementId: Readonly<Record<string, number>>;
}

export interface DraftImportBundle {
	document: {
		source: { appVersion?: string; profileId: string };
		project: { fps: number; height: number; name: string; width: number };
		timelines: Array<{
			isRoot: boolean;
			tracks: Array<{
				kind: string;
				segments: Array<{
					id: string;
					kind: string;
					sourceRange?: { durationUs: number; startUs: number };
					targetRange: { durationUs: number; startUs: number };
				}>;
			}>;
		}>;
		[key: string]: unknown;
	};
	internalIdBySemanticId: Record<string, string>;
	resourceStaging: Array<{ resourceId: string }>;
	[key: string]: unknown;
}

export interface DraftImportCommitDto {
	bundle: DraftImportBundle;
	envelopeCapture?: {
		envelope: unknown;
		payloadBase64: string;
	};
}

interface DraftImportSession {
	inspect(options: { input: unknown }): Promise<{
		fileCount: number;
		outcome: string;
		profileId?: string;
		semantic?: {
			resourceCount: number;
			segmentCount: number;
			trackCount: number;
		};
	}>;
	plan(options: { input: unknown }): Promise<{
		plan: {
			canCommit: boolean;
			planToken: string;
			warningFingerprints: string[];
		};
	}>;
	commit(options: { input: unknown }): Promise<DraftImportCommitDto>;
}

interface DraftSourceSnapshot {
	files: unknown[];
}

type PrepareWritebackResult =
	| {
			ok: true;
			changed: boolean;
			contentBytes: Uint8Array;
			expectedSourceSha256: string;
			patches: Array<{ jsonPointer: string }>;
	  }
	| { ok: false; issues: unknown[] };

export interface WritebackRuntime {
	profileId: string;
	activeContentMirrorTemplates: readonly [string, string, string, string];
	buildActiveContentMirrorPaths(options: {
		timelineId: string;
	}): readonly [string, string, string, string];
	buildImportTimelineTracks(options: {
		bundle: DraftImportBundle;
		mediaItemIdByResourceId: ReadonlyMap<string, string>;
	}): TimelineTrack[];
	createImportSession(options: {
		buildIdentity: { appVersion: string; interopSchemaVersion: number };
	}): DraftImportSession;
	discoverDraftDirectory(options: {
		draftDirectory: string;
	}): Promise<{ files: unknown[]; rootRealPath: string }>;
	prepareWriteback(options: {
		baselineDocument: DraftImportBundle["document"];
		bytesByPath: ReadonlyMap<string, Uint8Array>;
		envelope: unknown;
		internalIdBySemanticId: Readonly<Record<string, string>>;
		snapshot: CapCut81WritebackTimingSnapshot;
	}): PrepareWritebackResult;
	readDraftSourceSnapshot(options: {
		files: unknown[];
		rootRealPath: string;
	}): Promise<DraftSourceSnapshot>;
	recoverWriteback(options: { draftDirectory: string }): Promise<{
		action: "none" | "rolled-back" | "committed-cleanup" | "cleared-stale-lock";
	}>;
	verifyDraftSourceUnchanged(options: {
		snapshot: DraftSourceSnapshot;
	}): Promise<unknown[]>;
	verifyEnvelopePayload(options: {
		envelope: unknown;
		payloadBytes: Uint8Array;
	}): Promise<
		| { ok: true; bytesByPath: ReadonlyMap<string, Uint8Array> }
		| { ok: false; code: string; message: string }
	>;
	writeContent(options: {
		contentBytes: Uint8Array;
		draftDirectory: string;
		expectedSourceSha256: string;
		profileId: string;
	}): Promise<{ contentSha256: string; replacedMirrorCount: 4 }>;
}

async function loadModule<Shape>({
	relativePath,
	requiredExports,
}: {
	relativePath: string;
	requiredExports: string[];
}): Promise<Shape> {
	const moduleValue = (await import(
		pathToFileURL(join(PROJECT_ROOT, relativePath)).href
	)) as Record<string, unknown>;
	for (const exportName of requiredExports) {
		if (typeof moduleValue[exportName] !== "function") {
			throw new Error(`${relativePath} does not export ${exportName}.`);
		}
	}
	return moduleValue as Shape;
}

export async function loadCapCut81WritebackRuntime(): Promise<WritebackRuntime> {
	type SessionConstructor = new (options: {
		buildIdentity: { appVersion: string; interopSchemaVersion: number };
	}) => DraftImportSession;
	const [
		importState,
		envelopePayload,
		profile,
		prepare,
		writer,
		recovery,
		discovery,
		importSession,
		snapshot,
	] = await Promise.all([
		loadModule<{
			buildQCutImportTimelineTracks: WritebackRuntime["buildImportTimelineTracks"];
		}>({
			relativePath:
				"packages/editor-core/src/draft-interop/qcut-import-state.ts",
			requiredExports: ["buildQCutImportTimelineTracks"],
		}),
		loadModule<{
			verifyForeignEnvelopePayload: WritebackRuntime["verifyEnvelopePayload"];
		}>({
			relativePath:
				"packages/editor-core/src/draft-interop/foreign-envelope-payload.ts",
			requiredExports: ["verifyForeignEnvelopePayload"],
		}),
		import(
			pathToFileURL(
				join(
					PROJECT_ROOT,
					"packages/editor-core/src/jianying-draft/capcut-8-1-profile.ts"
				)
			).href
		) as Promise<Record<string, unknown>>,
		loadModule<{
			prepareCapCut81SameProfileWriteback: WritebackRuntime["prepareWriteback"];
		}>({
			relativePath:
				"packages/editor-core/src/jianying-draft/writeback/capcut-8-1-same-profile-prepare.ts",
			requiredExports: ["prepareCapCut81SameProfileWriteback"],
		}),
		loadModule<{
			writeCapCut81SameProfileContent: WritebackRuntime["writeContent"];
		}>({
			relativePath:
				"packages/jianying-draft-export/src/capcut-8-1-same-profile-writer.ts",
			requiredExports: ["writeCapCut81SameProfileContent"],
		}),
		loadModule<{
			recoverCapCut81SameProfileWriteback: WritebackRuntime["recoverWriteback"];
		}>({
			relativePath:
				"packages/jianying-draft-export/src/capcut-8-1-same-profile-transaction.ts",
			requiredExports: ["recoverCapCut81SameProfileWriteback"],
		}),
		loadModule<{
			discoverDraftDirectory: WritebackRuntime["discoverDraftDirectory"];
		}>({
			relativePath: "packages/jianying-draft-import/src/discovery.ts",
			requiredExports: ["discoverDraftDirectory"],
		}),
		loadModule<{ JianyingDraftImportSession: SessionConstructor }>({
			relativePath: "packages/jianying-draft-import/src/import-session.ts",
			requiredExports: ["JianyingDraftImportSession"],
		}),
		loadModule<{
			readDraftSourceSnapshot: WritebackRuntime["readDraftSourceSnapshot"];
			verifyDraftSourceUnchanged: WritebackRuntime["verifyDraftSourceUnchanged"];
		}>({
			relativePath: "packages/jianying-draft-import/src/snapshot-reader.ts",
			requiredExports: [
				"readDraftSourceSnapshot",
				"verifyDraftSourceUnchanged",
			],
		}),
	]);
	const profileId = profile.CAPCUT_8_1_PROFILE_ID;
	const activeContentMirrorTemplates =
		profile.CAPCUT_8_1_ACTIVE_CONTENT_MIRROR_TEMPLATES;
	const buildActiveContentMirrorPaths =
		profile.buildCapCut81ActiveContentMirrorPaths;
	if (
		typeof profileId !== "string" ||
		!Array.isArray(activeContentMirrorTemplates) ||
		activeContentMirrorTemplates.length !== 4 ||
		typeof buildActiveContentMirrorPaths !== "function"
	) {
		throw new Error("CapCut 8.1 profile runtime is incomplete.");
	}
	const [rootContent, rootTemplate, timelineContent, timelineTemplate] =
		activeContentMirrorTemplates;
	if (
		typeof rootContent !== "string" ||
		typeof rootTemplate !== "string" ||
		typeof timelineContent !== "string" ||
		typeof timelineTemplate !== "string"
	) {
		throw new Error("CapCut 8.1 mirror templates are invalid.");
	}
	const Session = importSession.JianyingDraftImportSession;
	return {
		profileId,
		activeContentMirrorTemplates: [
			rootContent,
			rootTemplate,
			timelineContent,
			timelineTemplate,
		],
		buildActiveContentMirrorPaths:
			buildActiveContentMirrorPaths as WritebackRuntime["buildActiveContentMirrorPaths"],
		buildImportTimelineTracks: importState.buildQCutImportTimelineTracks,
		createImportSession: (options) => new Session(options),
		discoverDraftDirectory: discovery.discoverDraftDirectory,
		prepareWriteback: prepare.prepareCapCut81SameProfileWriteback,
		readDraftSourceSnapshot: snapshot.readDraftSourceSnapshot,
		recoverWriteback: recovery.recoverCapCut81SameProfileWriteback,
		verifyDraftSourceUnchanged: snapshot.verifyDraftSourceUnchanged,
		verifyEnvelopePayload: envelopePayload.verifyForeignEnvelopePayload,
		writeContent: writer.writeCapCut81SameProfileContent,
	};
}
