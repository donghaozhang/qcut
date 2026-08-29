import type { ExportFormat } from "@/types/export";
import {
	assertRestrictedMediaExportAllowed,
	isRestrictedMediaExportError,
	type LocalFinalVideoExportOutput,
} from "../../../../../electron/types/restricted-media-export-policy";

interface ExportMediaRecord {
	id?: unknown;
	metadata?: unknown;
}

export const LOCAL_MP4_ENGINE_REQUIRED_ERROR_CODE =
	"QCUT_LOCAL_MP4_ENGINE_REQUIRED" as const;

export class LocalMp4EngineRequiredError extends Error {
	readonly code = LOCAL_MP4_ENGINE_REQUIRED_ERROR_CODE;

	constructor({ operation }: { operation: string }) {
		super(
			`[${LOCAL_MP4_ENGINE_REQUIRED_ERROR_CODE}] ${operation} requires an export engine that guarantees an MP4 container.`
		);
		this.name = "LocalMp4EngineRequiredError";
	}
}

function isAbsoluteLocalMp4OutputPath({
	outputPath,
}: {
	outputPath: string | undefined;
}): boolean {
	if (!outputPath) return false;
	const normalizedPath = outputPath.trim();
	const isAbsolutePath =
		normalizedPath.startsWith("/") ||
		normalizedPath.startsWith("\\\\") ||
		/^[a-z]:[\\/]/i.test(normalizedPath);
	return isAbsolutePath && /\.mp4$/i.test(normalizedPath);
}

export function resolveLocalFinalVideoExportOutput({
	format,
	isElectron,
	outputPath,
}: {
	format: ExportFormat;
	isElectron: boolean;
	outputPath?: string;
}): LocalFinalVideoExportOutput {
	return {
		container: format,
		destination:
			isElectron &&
			format === "mp4" &&
			isAbsoluteLocalMp4OutputPath({ outputPath })
				? "local-file"
				: "external",
		kind: "final-video",
	};
}

export function requiresRestrictedMediaLocalVideoAllowance({
	mediaItems,
	stickerOverlayMediaIds = [],
	tracks,
}: {
	mediaItems: readonly ExportMediaRecord[];
	stickerOverlayMediaIds?: readonly string[];
	tracks: readonly unknown[];
}): boolean {
	try {
		assertRestrictedMediaExportAllowed({
			additionalMediaIds: stickerOverlayMediaIds,
			mediaItems,
			operation: "local-final-video-engine-selection",
			scope: "timeline",
			tracks,
		});
		return false;
	} catch (error) {
		if (isRestrictedMediaExportError({ error })) return true;
		throw error;
	}
}

export function assertLocalMp4EngineNotRequired({
	operation,
	requiresRestrictedAllowance,
}: {
	operation: string;
	requiresRestrictedAllowance: boolean;
}): void {
	if (!requiresRestrictedAllowance) return;
	throw new LocalMp4EngineRequiredError({ operation });
}
