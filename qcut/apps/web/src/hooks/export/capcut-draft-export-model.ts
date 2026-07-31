import type { MediaItem } from "@/stores/media/media-store-types";
import type {
	CapCut81MigrationCommitDto,
	CapCut81MigrationInstallDto,
	CapCut81MigrationPlanDto,
	JianyingDraftExportErrorDto,
	JianyingDraftIssueDto,
	JianyingDraftTargetPlatformDto,
} from "@/types/electron/api-jianying-draft-export";
import type { ElectronAPI } from "@/types/electron/electron-api";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";

export interface CapCutDraftExportFailure {
	code: string;
	issues: JianyingDraftIssueDto[];
	message: string;
}

export type CapCutDraftExportState =
	| { phase: "idle" }
	| { phase: "planning" }
	| {
			phase: "reviewing";
			plan: CapCut81MigrationPlanDto;
			warningsAcknowledged: boolean;
	  }
	| { phase: "committing" }
	| {
			cleanupIssues: JianyingDraftIssueDto[];
			install:
				| { phase: "idle" }
				| { phase: "installing" }
				| { phase: "success"; result: CapCut81MigrationInstallDto }
				| { failure: CapCutDraftExportFailure; phase: "error" };
			phase: "success";
			result: CapCut81MigrationCommitDto;
	  }
	| { phase: "error"; failure: CapCutDraftExportFailure };

export interface CapCutDraftExportElectronAPI
	extends Pick<
		ElectronAPI,
		| "getFileInfo"
		| "getPathForFile"
		| "jianyingDraftExport"
		| "mediaImport"
		| "platform"
		| "shell"
	> {}

export interface UseCapCutDraftExportOptions {
	electronAPI: CapCutDraftExportElectronAPI | undefined;
	mediaItems: readonly MediaItem[];
	project: TProject | null;
	tracks: readonly TimelineTrack[];
}

export interface CapCutDraftExportController {
	acknowledgeWarnings: ({ accepted }: { accepted: boolean }) => void;
	commitExport: () => Promise<void>;
	installDraft: () => Promise<void>;
	isBusy: boolean;
	planExport: () => Promise<void>;
	reset: () => Promise<void>;
	state: CapCutDraftExportState;
	unavailableReason: string | null;
}

export interface SourceInputs {
	mediaItems: readonly MediaItem[];
	project: TProject | null;
	tracks: readonly TimelineTrack[];
}

export const IDLE_STATE: CapCutDraftExportState = { phase: "idle" };

export function resolveTargetPlatform({
	platform,
}: {
	platform: string;
}): JianyingDraftTargetPlatformDto | null {
	if (platform === "darwin") return "macos";
	return null;
}

export function createRemoteFailure({
	error,
}: {
	error: JianyingDraftExportErrorDto;
}): CapCutDraftExportFailure {
	const validationIssues =
		error.details?.issues?.map(({ message, path }) => ({
			code: "INVALID_REQUEST",
			message: `${path}: ${message}`,
			severity: "error" as const,
		})) ?? [];
	return {
		code: error.code,
		issues: validationIssues,
		message: error.message,
	};
}

export function createCaughtFailure({
	error,
	fallbackMessage,
}: {
	error: unknown;
	fallbackMessage: string;
}): CapCutDraftExportFailure {
	return {
		code: "UNEXPECTED_ERROR",
		issues: [],
		message: error instanceof Error ? error.message : fallbackMessage,
	};
}

export function createCleanupFailure({
	issues,
	message,
}: {
	issues: JianyingDraftIssueDto[];
	message: string;
}): CapCutDraftExportFailure {
	return {
		code: "STAGING_CLEANUP_FAILED",
		issues,
		message,
	};
}

export function getUnavailableReason({
	electronAPI,
	project,
}: {
	electronAPI: CapCutDraftExportElectronAPI | undefined;
	project: TProject | null;
}): string | null {
	if (!project) return "Open a project before exporting a CapCut draft.";
	if (!electronAPI) {
		return "CapCut draft export is available in the QCut desktop app.";
	}
	if (!resolveTargetPlatform({ platform: electronAPI.platform })) {
		return "CapCut draft export currently supports macOS.";
	}
	if (
		typeof electronAPI.getFileInfo !== "function" ||
		typeof electronAPI.getPathForFile !== "function" ||
		!electronAPI.jianyingDraftExport ||
		!electronAPI.mediaImport
	) {
		return "Update the QCut desktop app to enable CapCut draft export.";
	}
	return null;
}

export function didSourceInputsChange({
	current,
	previous,
}: {
	current: SourceInputs;
	previous: SourceInputs;
}): boolean {
	return (
		current.mediaItems !== previous.mediaItems ||
		current.project !== previous.project ||
		current.tracks !== previous.tracks
	);
}
