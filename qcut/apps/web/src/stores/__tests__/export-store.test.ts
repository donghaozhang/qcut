import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useExportStore } from "@/stores/export-store";
import type { ExportSettings, ExportProgress } from "@/types/export";

describe("ExportStore", () => {
	beforeEach(() => {
		const { result } = renderHook(() => useExportStore());
		act(() => {
			result.current.resetExport();
			result.current.clearHistory();
		});
	});

	it("initializes with default settings", () => {
		const { result } = renderHook(() => useExportStore());

		expect(result.current.settings.format).toBe("webm");
		expect(result.current.settings.quality).toBe("1080p");
		expect(result.current.settings.width).toBe(1920);
		expect(result.current.settings.height).toBe(1080);
		expect(result.current.settings.filename).toBeDefined();
		expect(result.current.isDialogOpen).toBe(false);
		expect(result.current.panelView).toBe("export");
	});

	it("updates export settings", () => {
		const { result } = renderHook(() => useExportStore());

		act(() => {
			result.current.updateSettings({
				quality: "720p",
				filename: "custom-export.webm",
			});
		});

		expect(result.current.settings.quality).toBe("720p");
		expect(result.current.settings.filename).toBe("custom-export.webm");
		// Resolution should update with quality
		expect(result.current.settings.width).toBe(1280);
		expect(result.current.settings.height).toBe(720);
		// Format should remain unchanged
		expect(result.current.settings.format).toBe("webm");
	});

	it("updates export format", () => {
		const { result } = renderHook(() => useExportStore());

		act(() => {
			result.current.updateSettings({
				format: "mp4",
			});
		});

		expect(result.current.settings.format).toBe("mp4");
	});

	it("tracks export progress", () => {
		const { result } = renderHook(() => useExportStore());

		act(() => {
			result.current.updateProgress({
				isExporting: true,
				progress: 0,
				status: "Preparing export...",
				estimatedTimeRemaining: 120,
			});
		});

		expect(result.current.progress.isExporting).toBe(true);
		expect(result.current.progress.progress).toBe(0);
		expect(result.current.progress.status).toBe("Preparing export...");
		expect(result.current.progress.estimatedTimeRemaining).toBe(120);

		act(() => {
			result.current.updateProgress({
				progress: 50,
				currentFrame: 150,
				totalFrames: 300,
				estimatedTimeRemaining: 60,
			});
		});

		expect(result.current.progress.progress).toBe(50);
		expect(result.current.progress.currentFrame).toBe(150);
		expect(result.current.progress.totalFrames).toBe(300);

		act(() => {
			result.current.updateProgress({
				isExporting: false,
				progress: 100,
				status: "Export complete",
			});
		});

		expect(result.current.progress.isExporting).toBe(false);
		expect(result.current.progress.progress).toBe(100);
	});

	it("manages export history", () => {
		const { result } = renderHook(() => useExportStore());

		expect(result.current.exportHistory).toHaveLength(0);

		act(() => {
			result.current.addToHistory({
				filename: "test-export.mp4",
				settings: result.current.settings,
				duration: 120,
				fileSize: 50_000_000,
				success: true,
			});
		});

		expect(result.current.exportHistory).toHaveLength(1);
		expect(result.current.exportHistory[0].filename).toBe("test-export.mp4");
		expect(result.current.exportHistory[0].duration).toBe(120);
		expect(result.current.exportHistory[0].fileSize).toBe(50_000_000);
		expect(result.current.exportHistory[0].success).toBe(true);
		expect(result.current.exportHistory[0].id).toBeDefined();
		expect(result.current.exportHistory[0].timestamp).toBeDefined();
	});

	it("adds failed export to history", () => {
		const { result } = renderHook(() => useExportStore());

		act(() => {
			result.current.addToHistory({
				filename: "failed-export.mp4",
				settings: result.current.settings,
				duration: 30,
				success: false,
				error: "Encoding failed: insufficient memory",
			});
		});

		expect(result.current.exportHistory).toHaveLength(1);
		expect(result.current.exportHistory[0].success).toBe(false);
		expect(result.current.exportHistory[0].error).toBe(
			"Encoding failed: insufficient memory"
		);
	});

	it("clears export history", () => {
		const { result } = renderHook(() => useExportStore());

		// Add multiple history entries
		act(() => {
			result.current.addToHistory({
				filename: "export1.mp4",
				settings: result.current.settings,
				duration: 60,
				success: true,
			});
			result.current.addToHistory({
				filename: "export2.mp4",
				settings: result.current.settings,
				duration: 90,
				success: true,
			});
		});

		expect(result.current.exportHistory).toHaveLength(2);

		act(() => {
			result.current.clearHistory();
		});

		expect(result.current.exportHistory).toHaveLength(0);
	});

	it("manages dialog state", () => {
		const { result } = renderHook(() => useExportStore());

		expect(result.current.isDialogOpen).toBe(false);

		act(() => {
			result.current.setDialogOpen(true);
		});

		expect(result.current.isDialogOpen).toBe(true);

		act(() => {
			result.current.setDialogOpen(false);
		});

		expect(result.current.isDialogOpen).toBe(false);
	});

	it("manages panel view", () => {
		const { result } = renderHook(() => useExportStore());

		expect(result.current.panelView).toBe("export");

		act(() => {
			result.current.setPanelView("properties");
		});

		expect(result.current.panelView).toBe("properties");

		act(() => {
			result.current.setPanelView("export");
		});

		expect(result.current.panelView).toBe("export");
	});

	it("sets and clears error state", () => {
		const { result } = renderHook(() => useExportStore());

		expect(result.current.error).toBe(null);

		act(() => {
			result.current.setError("FFmpeg not loaded");
		});

		expect(result.current.error).toBe("FFmpeg not loaded");

		act(() => {
			result.current.setError(null);
		});

		expect(result.current.error).toBe(null);
	});

	it("resets export state", () => {
		const { result } = renderHook(() => useExportStore());

		// Set various states
		act(() => {
			result.current.updateProgress({
				isExporting: true,
				progress: 75,
				estimatedTimeRemaining: 30,
			});
			result.current.setError("Test error");
			result.current.updateSettings({
				quality: "480p",
			});
		});

		// Reset
		act(() => {
			result.current.resetExport();
		});

		expect(result.current.progress.progress).toBe(0);
		expect(result.current.progress.isExporting).toBe(false);
		expect(result.current.error).toBe(null);
		// Settings should be reset to defaults
		expect(result.current.settings.quality).toBe("1080p");
		expect(result.current.settings.format).toBe("webm");
	});

	it("maintains settings across reset", () => {
		const { result } = renderHook(() => useExportStore());

		act(() => {
			result.current.updateSettings({
				format: "mp4",
				quality: "720p",
				filename: "test-export.mp4",
			});
		});

		const settingsBeforeReset = { ...result.current.settings };

		act(() => {
			result.current.resetExport();
		});

		// Settings should be reset to defaults, not maintained
		expect(result.current.settings).not.toEqual(settingsBeforeReset);
		expect(result.current.settings.format).toBe("webm");
		expect(result.current.settings.quality).toBe("1080p");
	});
});
