/**
 * Tests for useProjectFolder hook.
 *
 * @module hooks/__tests__/use-project-folder.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { initPlatform } from "@qcut/platform-core";
import { createDesktopAdapter } from "@qcut/platform-desktop";

// Mock stores before importing hook
vi.mock("@/stores/project-store", () => ({
	useProjectStore: vi.fn(() => ({
		activeProject: { id: "test-project-123" },
	})),
}));

// Import after mocking
import { useProjectFolder } from "../use-project-folder";
import { useProjectStore } from "@/stores/project-store";

describe("useProjectFolder", () => {
	const mockListResult = [
		{
			name: "video.mp4",
			path: "/projects/test/media/video.mp4",
			relativePath: "media/video.mp4",
			type: "video" as const,
			size: 1_024_000,
			modifiedAt: Date.now(),
			isDirectory: false,
		},
		{
			name: "images",
			path: "/projects/test/media/images",
			relativePath: "media/images",
			type: "unknown" as const,
			size: 0,
			modifiedAt: Date.now(),
			isDirectory: true,
		},
	];

	const mockScanResult = {
		files: mockListResult.filter((e) => !e.isDirectory),
		folders: ["media/images"],
		totalSize: 1_024_000,
		scanTime: 50,
	};

	const mockEnsureResult = {
		created: ["media/temp"],
		existing: ["media", "media/imported"],
	};

	beforeEach(() => {
		// Setup electronAPI mock
		const projectFolder = {
			getRoot: vi.fn().mockResolvedValue("/projects/test-project-123"),
			list: vi.fn().mockResolvedValue(mockListResult),
			scan: vi.fn().mockResolvedValue(mockScanResult),
			ensureStructure: vi.fn().mockResolvedValue(mockEnsureResult),
		};

		Object.defineProperty(window, "electronAPI", {
			value: { projectFolder },
			writable: true,
			configurable: true,
		});
		initPlatform(createDesktopAdapter());
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should have projectId from store", () => {
		const { result } = renderHook(() => useProjectFolder());
		expect(result.current.projectId).toBe("test-project-123");
	});

	it("should initialize with media directory", async () => {
		const { result } = renderHook(() => useProjectFolder());

		await waitFor(() => {
			expect(result.current.entries.length).toBeGreaterThan(0);
		});

		expect(result.current.currentPath).toBe("media");
		expect(window.electronAPI?.projectFolder?.list).toHaveBeenCalledWith(
			"test-project-123",
			"media"
		);
	});

	it("should ensure project structure on mount", async () => {
		renderHook(() => useProjectFolder());

		await waitFor(() => {
			expect(
				window.electronAPI?.projectFolder?.ensureStructure
			).toHaveBeenCalledWith("test-project-123");
		});
	});

	it("should navigate to subdirectories", async () => {
		const { result } = renderHook(() => useProjectFolder());

		await waitFor(() => {
			expect(result.current.entries.length).toBeGreaterThan(0);
		});

		act(() => {
			result.current.navigateTo("media/images");
		});

		await waitFor(() => {
			expect(window.electronAPI?.projectFolder?.list).toHaveBeenCalledWith(
				"test-project-123",
				"media/images"
			);
		});
	});

	it("should navigate up to parent directory", async () => {
		const { result } = renderHook(() => useProjectFolder());

		await waitFor(() => {
			expect(result.current.currentPath).toBe("media");
		});

		// Navigate deeper first
		act(() => {
			result.current.navigateTo("media/images");
		});

		await waitFor(() => {
			expect(result.current.currentPath).toBe("media/images");
		});

		// Now navigate up
		act(() => {
			result.current.navigateUp();
		});

		await waitFor(() => {
			expect(window.electronAPI?.projectFolder?.list).toHaveBeenLastCalledWith(
				"test-project-123",
				"media"
			);
		});
	});

	it("should scan for media files recursively", async () => {
		const { result } = renderHook(() => useProjectFolder());

		let scanResult;
		await act(async () => {
			scanResult = await result.current.scanForMedia("media");
		});

		expect(scanResult).toEqual(mockScanResult);
		expect(window.electronAPI?.projectFolder?.scan).toHaveBeenCalledWith(
			"test-project-123",
			"media",
			{ recursive: true, mediaOnly: true }
		);
	});

	it("should handle scan errors gracefully", async () => {
		window.electronAPI!.projectFolder!.scan = vi
			.fn()
			.mockRejectedValue(new Error("Scan failed"));

		const { result } = renderHook(() => useProjectFolder());

		await act(async () => {
			await result.current.scanForMedia();
		});

		expect(result.current.error).toBe("Scan failed");
	});

	it("should generate correct breadcrumbs", async () => {
		const { result } = renderHook(() => useProjectFolder());

		// Wait for initial load
		await waitFor(() => {
			expect(result.current.currentPath).toBe("media");
		});

		// After initialization with media directory
		expect(result.current.getBreadcrumbs()).toEqual([
			{ name: "Project Root", path: "" },
			{ name: "media", path: "media" },
		]);

		// Navigate deeper
		act(() => {
			result.current.navigateTo("media/imported/videos");
		});

		await waitFor(() => {
			expect(result.current.currentPath).toBe("media/imported/videos");
		});

		const breadcrumbs = result.current.getBreadcrumbs();
		expect(breadcrumbs).toHaveLength(4);
		expect(breadcrumbs[0]).toEqual({ name: "Project Root", path: "" });
		expect(breadcrumbs[1]).toEqual({ name: "media", path: "media" });
		expect(breadcrumbs[2]).toEqual({
			name: "imported",
			path: "media/imported",
		});
		expect(breadcrumbs[3]).toEqual({
			name: "videos",
			path: "media/imported/videos",
		});
	});

	it("should refresh current directory", async () => {
		const { result } = renderHook(() => useProjectFolder());

		await waitFor(() => {
			expect(result.current.entries.length).toBeGreaterThan(0);
		});

		// Clear mock calls
		vi.clearAllMocks();

		act(() => {
			result.current.refresh();
		});

		await waitFor(() => {
			expect(window.electronAPI?.projectFolder?.list).toHaveBeenCalledWith(
				"test-project-123",
				"media"
			);
		});
	});

	it("should handle no project selected", () => {
		vi.mocked(useProjectStore).mockReturnValue({
			activeProject: null,
		} as any);

		const { result } = renderHook(() => useProjectFolder());

		expect(result.current.projectId).toBeUndefined();
		expect(result.current.entries).toEqual([]);
	});

	it("should handle missing electronAPI gracefully", () => {
		Object.defineProperty(window, "electronAPI", {
			value: undefined,
			writable: true,
			configurable: true,
		});

		const { result } = renderHook(() => useProjectFolder());

		// Should not throw
		expect(result.current.entries).toEqual([]);
	});
});
