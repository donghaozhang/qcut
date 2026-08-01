import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface MigrationPlanIssue {
	code: string;
	elementId?: string;
	mediaId?: string;
	message: string;
	severity: "error" | "info" | "warning";
	trackId?: string;
}

export interface MigrationExportPlan {
	blockerFingerprints: readonly string[];
	canCommit: boolean;
	expiresAtUnixMilliseconds: number;
	issueSetFingerprint: string;
	issues: readonly Readonly<MigrationPlanIssue>[];
	planToken: string;
	requestFingerprint: string;
	warningFingerprints: readonly string[];
}

export interface MigrationCopiedAsset {
	bytes: number;
	materialId: string;
	mediaId: string;
	probe: unknown;
	relativePath: string;
	sha256: string;
	type: "audio" | "image" | "video";
}

export interface MigrationGeneratedAsset {
	bytes: number;
	effectMaterialId: string;
	kind: "generated-lut";
	relativePath: string;
	sha256: string;
}

export interface MigrationBundleIds {
	draftId: string;
	placeholderId: string;
	projectId: string;
	timelineId: string;
}

export interface MigrationBundleWriteResult {
	completeMarkerPath: string;
	contentSha256: string;
	copiedAssets: MigrationCopiedAsset[];
	draftDirectory: string;
	draftFolderName: string;
	durabilityWarnings: string[];
	generatedAssets: MigrationGeneratedAsset[];
	ids: MigrationBundleIds;
	manifestPath: string;
	outputDirectory: string;
}

export interface VerifiedMigrationBundle {
	contentText: string;
	draftDirectories: readonly string[];
	draftFiles: readonly {
		bytes: number;
		relativePath: string;
		sha256: string;
	}[];
	draftFolderName: string;
	manifest: {
		assets: Array<{ bytes: number; relativePath: string; sha256: string }>;
		content: { bytes: number; sha256: string };
		generatedAssets: Array<{
			bytes: number;
			relativePath: string;
			sha256: string;
		}>;
		ids: MigrationBundleIds;
		timelineMaterialsSize: number;
	};
	outputDirectory: string;
}

export interface MigrationExportSession {
	commit({ input }: { input: unknown }): Promise<MigrationBundleWriteResult>;
	dispose(): void;
	plan({ input }: { input: unknown }): Promise<MigrationExportPlan>;
}

interface MigrationSessionConstructor {
	new (options: {
		allowedSourceRootDirectory: string;
		capCutAppPath: string;
		ffprobePath: string;
		outputParentDirectory: string;
	}): MigrationExportSession;
}

export interface MigrationApi {
	CapCut81MigrationExportSession: MigrationSessionConstructor;
	verifyCapCut81MigrationBundle: ({
		outputDirectory,
	}: {
		outputDirectory: string;
	}) => Promise<VerifiedMigrationBundle>;
}

interface SessionModule {
	CapCut81MigrationExportSession: MigrationSessionConstructor;
}

interface VerifierModule {
	verifyCapCut81MigrationBundle: MigrationApi["verifyCapCut81MigrationBundle"];
}

function isSessionModule({ value }: { value: unknown }): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		"CapCut81MigrationExportSession" in value &&
		typeof value.CapCut81MigrationExportSession === "function"
	);
}

function isVerifierModule({ value }: { value: unknown }): boolean {
	return (
		typeof value === "object" &&
		value !== null &&
		"verifyCapCut81MigrationBundle" in value &&
		typeof value.verifyCapCut81MigrationBundle === "function"
	);
}

export async function loadMigrationApi({
	projectRoot,
}: {
	projectRoot: string;
}): Promise<MigrationApi> {
	const packageSource = join(
		projectRoot,
		"packages",
		"jianying-draft-export",
		"src"
	);
	const sessionPath = join(packageSource, "capcut-8-1-migration-session.ts");
	const verifierPath = join(
		packageSource,
		"capcut-8-1-migration-bundle-reader.ts"
	);
	const [sessionValue, verifierValue]: [unknown, unknown] = await Promise.all([
		import(pathToFileURL(sessionPath).href),
		import(pathToFileURL(verifierPath).href),
	]);
	if (!isSessionModule({ value: sessionValue })) {
		throw new Error(
			`@qcut/jianying-draft-export is missing CapCut81MigrationExportSession at ${sessionPath}.`
		);
	}
	if (!isVerifierModule({ value: verifierValue })) {
		throw new Error(
			`@qcut/jianying-draft-export is missing verifyCapCut81MigrationBundle at ${verifierPath}.`
		);
	}
	return {
		CapCut81MigrationExportSession: (sessionValue as SessionModule)
			.CapCut81MigrationExportSession,
		verifyCapCut81MigrationBundle: (verifierValue as VerifierModule)
			.verifyCapCut81MigrationBundle,
	};
}
