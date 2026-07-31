import { isAbsolute } from "node:path";
import type {
	CapCut81MigrationInstallDto,
	CapCut81MigrationInstallRequestDto,
} from "./jianying-draft-export-contract.js";
import type { CapCut81TargetAppGuard } from "./capcut-8-1-install-guard.js";

const MAX_CONTENT_MIRROR_COUNT = 100_000;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_PATH_LENGTH = 4096;
const MAX_DRAFT_FOLDER_NAME_LENGTH = 255;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

type CommittedBundleState = "available" | "installing" | "consumed";

interface RuntimeInstallResult {
	contentMirrorPaths: readonly unknown[];
	draftDirectory: string;
	draftFolderName: string;
	draftId: string;
	installedContentSha256: string;
	rootMetaInfoBackupPath: string;
	rootMetaInfoPath: string;
	targetDraftStoreDirectory: string;
	timelineId: string;
}

export interface RuntimeInstallerOptions {
	assertTargetAppClosed: CapCut81TargetAppGuard;
	capCutAppPath: string;
	outputDirectory: string;
	targetDraftStoreDirectory: string;
}

export type CapCut81MigrationRuntimeInstaller = ({
	assertTargetAppClosed,
	capCutAppPath,
	outputDirectory,
	targetDraftStoreDirectory,
}: RuntimeInstallerOptions) => Promise<RuntimeInstallResult>;

interface CreateCommittedBundleInstallerOptions {
	assertTargetAppClosed: CapCut81TargetAppGuard;
	getCapCutAppPath: () => string;
	getRuntimeInstaller: () => Promise<CapCut81MigrationRuntimeInstaller>;
	getTargetDraftStoreDirectory: () => string;
}

export interface CommittedCapCut81BundleInstaller {
	dispose(): void;
	install({ input }: { input: unknown }): Promise<CapCut81MigrationInstallDto>;
	recordCommittedOutput({ outputDirectory }: { outputDirectory: string }): void;
}

export class CapCut81InstallConsumedError extends Error {
	constructor() {
		super("This committed CapCut migration bundle has already been installed.");
		this.name = "CapCut81InstallConsumedError";
	}
}

export class CapCut81InstallNotCommittedError extends Error {
	constructor() {
		super(
			"The requested CapCut migration bundle was not committed by this session."
		);
		this.name = "CapCut81InstallNotCommittedError";
	}
}

export class InvalidCapCut81InstallRequestError extends Error {
	constructor({ message }: { message: string }) {
		super(message);
		this.name = "InvalidCapCut81InstallRequestError";
	}
}

export class InvalidCapCut81InstallResultError extends Error {
	constructor({ field }: { field: string }) {
		super(`The CapCut installer returned an invalid ${field}.`);
		this.name = "InvalidCapCut81InstallResultError";
	}
}

export class CapCut81InstallDisposedError extends Error {
	constructor() {
		super("The CapCut migration installer has been disposed.");
		this.name = "CapCut81InstallDisposedError";
	}
}

function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new InvalidCapCut81InstallRequestError({
			message: `${label} must be an object.`,
		});
	}
	return value as Record<string, unknown>;
}

function parseInstallRequest({
	input,
}: {
	input: unknown;
}): CapCut81MigrationInstallRequestDto {
	const record = requireRecord({ label: "Install request", value: input });
	const keys = Object.keys(record);
	if (keys.length !== 1 || keys[0] !== "outputDirectory") {
		throw new InvalidCapCut81InstallRequestError({
			message: "Install request must contain only outputDirectory.",
		});
	}
	if (
		typeof record.outputDirectory !== "string" ||
		record.outputDirectory.length === 0 ||
		record.outputDirectory.length > MAX_PATH_LENGTH ||
		!isAbsolute(record.outputDirectory)
	) {
		throw new InvalidCapCut81InstallRequestError({
			message: "Install outputDirectory must be a bounded absolute path.",
		});
	}
	return { outputDirectory: record.outputDirectory };
}

function requireBoundedString({
	field,
	maxLength,
	value,
}: {
	field: string;
	maxLength: number;
	value: unknown;
}): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > maxLength
	) {
		throw new InvalidCapCut81InstallResultError({ field });
	}
	return value;
}

function requirePath({
	field,
	value,
}: {
	field: string;
	value: unknown;
}): string {
	const path = requireBoundedString({
		field,
		maxLength: MAX_PATH_LENGTH,
		value,
	});
	if (!isAbsolute(path)) {
		throw new InvalidCapCut81InstallResultError({ field });
	}
	return path;
}

function toInstallDto({
	result,
}: {
	result: RuntimeInstallResult;
}): CapCut81MigrationInstallDto {
	if (
		!Array.isArray(result.contentMirrorPaths) ||
		result.contentMirrorPaths.length > MAX_CONTENT_MIRROR_COUNT
	) {
		throw new InvalidCapCut81InstallResultError({
			field: "contentMirrorPaths",
		});
	}
	const installedContentSha256 = requireBoundedString({
		field: "installedContentSha256",
		maxLength: 64,
		value: result.installedContentSha256,
	});
	if (!SHA256_PATTERN.test(installedContentSha256)) {
		throw new InvalidCapCut81InstallResultError({
			field: "installedContentSha256",
		});
	}
	return {
		contentMirrorCount: result.contentMirrorPaths.length,
		draftDirectory: requirePath({
			field: "draftDirectory",
			value: result.draftDirectory,
		}),
		draftFolderName: requireBoundedString({
			field: "draftFolderName",
			maxLength: MAX_DRAFT_FOLDER_NAME_LENGTH,
			value: result.draftFolderName,
		}),
		draftId: requireBoundedString({
			field: "draftId",
			maxLength: MAX_IDENTIFIER_LENGTH,
			value: result.draftId,
		}),
		installedContentSha256,
		rootMetaInfoBackupPath: requirePath({
			field: "rootMetaInfoBackupPath",
			value: result.rootMetaInfoBackupPath,
		}),
		rootMetaInfoPath: requirePath({
			field: "rootMetaInfoPath",
			value: result.rootMetaInfoPath,
		}),
		targetDraftStoreDirectory: requirePath({
			field: "targetDraftStoreDirectory",
			value: result.targetDraftStoreDirectory,
		}),
		timelineId: requireBoundedString({
			field: "timelineId",
			maxLength: MAX_IDENTIFIER_LENGTH,
			value: result.timelineId,
		}),
	};
}

function requireMainOwnedPath({
	label,
	value,
}: {
	label: string;
	value: string;
}): string {
	if (
		value.length === 0 ||
		value.length > MAX_PATH_LENGTH ||
		!isAbsolute(value)
	) {
		throw new Error(`${label} must be a bounded absolute path.`);
	}
	return value;
}

export function createCommittedCapCut81BundleInstaller({
	assertTargetAppClosed,
	getCapCutAppPath,
	getRuntimeInstaller,
	getTargetDraftStoreDirectory,
}: CreateCommittedBundleInstallerOptions): CommittedCapCut81BundleInstaller {
	const committedOutputs = new Map<string, CommittedBundleState>();
	let disposed = false;

	return {
		dispose: () => {
			disposed = true;
			committedOutputs.clear();
		},
		install: async ({ input }) => {
			if (disposed) {
				throw new CapCut81InstallDisposedError();
			}
			const { outputDirectory } = parseInstallRequest({ input });
			const state = committedOutputs.get(outputDirectory);
			if (state === undefined) {
				throw new CapCut81InstallNotCommittedError();
			}
			if (state !== "available") {
				throw new CapCut81InstallConsumedError();
			}
			committedOutputs.set(outputDirectory, "installing");
			let result: RuntimeInstallResult;
			try {
				const runtimeInstaller = await getRuntimeInstaller();
				result = await runtimeInstaller({
					assertTargetAppClosed,
					capCutAppPath: requireMainOwnedPath({
						label: "CapCut application path",
						value: getCapCutAppPath(),
					}),
					outputDirectory,
					targetDraftStoreDirectory: requireMainOwnedPath({
						label: "CapCut draft store path",
						value: getTargetDraftStoreDirectory(),
					}),
				});
			} catch (error) {
				committedOutputs.set(outputDirectory, "available");
				throw error;
			}
			committedOutputs.set(outputDirectory, "consumed");
			return toInstallDto({ result });
		},
		recordCommittedOutput: ({ outputDirectory }) => {
			const trustedOutputDirectory = requireMainOwnedPath({
				label: "Committed CapCut bundle output",
				value: outputDirectory,
			});
			if (!committedOutputs.has(trustedOutputDirectory)) {
				committedOutputs.set(trustedOutputDirectory, "available");
			}
		},
	};
}
