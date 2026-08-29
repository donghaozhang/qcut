import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import { useExportStore } from "@/stores/export-store";

const exportMocks = vi.hoisted(() => ({
	cancel: vi.fn(),
	createEngine: vi.fn(),
	engineExport: vi.fn(),
	lockForExport: vi.fn(),
	saveExportedVideo: vi.fn(),
	unlockFromExport: vi.fn(),
}));

const tracks: TimelineTrack[] = [
	{
		elements: [
			{
				duration: 1,
				id: "media-element",
				mediaId: "media-item",
				name: "Media",
				startTime: 0,
				trimEnd: 0,
				trimStart: 0,
				type: "media",
			},
		],
		id: "media-track",
		name: "Media",
		type: "media",
	},
];

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: () => ({ tracks }),
}));

vi.mock("@/hooks/media/use-async-media-store", () => ({
	useAsyncMediaItems: () => ({ mediaItems: [] }),
}));

vi.mock("@/hooks/useElectron", () => ({
	useElectron: () => ({ isElectron: () => true }),
}));

vi.mock("@/lib/media/blob-manager", () => ({
	lockForExport: exportMocks.lockForExport,
	unlockFromExport: exportMocks.unlockFromExport,
}));

vi.mock("@/lib/export/export-output", () => ({
	saveExportedVideo: exportMocks.saveExportedVideo,
}));

vi.mock("@/lib/audio/completion-chime", () => ({
	playCompletionChime: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/export/export-engine-factory", () => ({
	ExportEngineFactory: {
		getInstance: () => ({ createEngine: exportMocks.createEngine }),
	},
	ExportEngineType: {
		CLI: "cli",
		FFMPEG: "ffmpeg",
		REMOTION: "remotion",
		STANDARD: "standard",
	},
}));

import { useExportProgress } from "../use-export-progress";

describe("useExportProgress automation cancellation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useExportStore.getState().resetExport();
	});

	it("rejects a cancelled automation export after UI cleanup", async () => {
		let resolveEngineExport: ((blob: Blob) => void) | undefined;
		const pendingEngineExport = new Promise<Blob>((resolve) => {
			resolveEngineExport = resolve;
		});
		exportMocks.engineExport.mockReturnValue(pendingEngineExport);
		exportMocks.createEngine.mockResolvedValue({
			cancel: exportMocks.cancel,
			export: exportMocks.engineExport,
		});
		const { result } = renderHook(() => useExportProgress());

		let exportPromise: Promise<void> | undefined;
		act(() => {
			exportPromise = result.current.handleExport(
				document.createElement("canvas"),
				1,
				{
					engineType: "auto",
					filename: "cancelled.mp4",
					format: "mp4",
					frameRate: 30,
					outputPath: "/tmp/cancelled.mp4",
					propagateErrors: true,
					quality: "720p",
					resolution: { height: 1280, width: 720 },
				}
			);
		});
		await waitFor(() => {
			expect(exportMocks.engineExport).toHaveBeenCalledTimes(1);
			expect(result.current.progress.isExporting).toBe(true);
		});

		act(() => result.current.handleCancel());
		if (!resolveEngineExport || !exportPromise) {
			throw new Error("Export promise was not initialized.");
		}
		resolveEngineExport(new Blob(["cancelled"]));

		await expect(exportPromise).rejects.toThrow("Export cancelled by user");
		expect(exportMocks.saveExportedVideo).not.toHaveBeenCalled();
		expect(exportMocks.unlockFromExport).toHaveBeenCalledTimes(1);
		expect(result.current.progress.status).toBe("Export cancelled");
	});
});
