import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockWriteFile = vi.fn();
const mockShareShare = vi.fn();

// Mock Capacitor modules that may not be installed
vi.mock("@capacitor/share", () => ({
	Share: { share: mockShareShare },
}));

vi.mock("@capacitor/filesystem", () => ({
	Filesystem: { writeFile: mockWriteFile },
	Directory: { Documents: "DOCUMENTS" },
}));

import { saveExportedVideo, shareExportedVideo } from "../export-output";

describe("export-output", () => {
	let originalCreateObjectURL: typeof URL.createObjectURL;
	let originalRevokeObjectURL: typeof URL.revokeObjectURL;

	beforeEach(() => {
		vi.clearAllMocks();
		originalCreateObjectURL = URL.createObjectURL;
		originalRevokeObjectURL = URL.revokeObjectURL;

		URL.createObjectURL = vi.fn().mockReturnValue("blob:test-url");
		URL.revokeObjectURL = vi.fn();

		// Ensure Capacitor is NOT available (browser fallback)
		delete (window as any).Capacitor;
		// Remove Web Share API
		delete (navigator as any).share;
		delete (navigator as any).canShare;
	});

	afterEach(() => {
		URL.createObjectURL = originalCreateObjectURL;
		URL.revokeObjectURL = originalRevokeObjectURL;
		delete (window as any).Capacitor;
		delete (navigator as any).share;
		delete (navigator as any).canShare;
	});

	describe("saveExportedVideo (browser fallback)", () => {
		it("creates a download link and clicks it", async () => {
			const blob = new Blob(["test"], { type: "video/mp4" });
			const appendSpy = vi.spyOn(document.body, "appendChild");
			const removeSpy = vi.spyOn(document.body, "removeChild");

			const result = await saveExportedVideo(blob, "test.mp4");

			expect(result.success).toBe(true);
			expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
			expect(appendSpy).toHaveBeenCalled();

			// Check the <a> element
			const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
			expect(anchor.tagName).toBe("A");
			expect(anchor.download).toBe("test.mp4");
			expect(anchor.href).toContain("blob:test-url");

			appendSpy.mockRestore();
			removeSpy.mockRestore();
		});

		it("returns success true for valid blob", async () => {
			const blob = new Blob(["video data"], { type: "video/mp4" });
			const result = await saveExportedVideo(blob, "export.mp4");
			expect(result.success).toBe(true);
		});
	});

	describe("saveExportedVideo (Web Share API)", () => {
		it("uses navigator.share when available and supported", async () => {
			const mockShare = vi.fn().mockResolvedValue(undefined);
			(navigator as any).share = mockShare;
			(navigator as any).canShare = vi.fn().mockReturnValue(true);

			const blob = new Blob(["test"], { type: "video/mp4" });
			const result = await saveExportedVideo(blob, "test.mp4");

			expect(result.success).toBe(true);
			expect(mockShare).toHaveBeenCalledWith(
				expect.objectContaining({ title: "test.mp4" })
			);
			// Should NOT fall through to browser download
			expect(URL.createObjectURL).not.toHaveBeenCalled();
		});

		it("falls back to browser download when share fails", async () => {
			(navigator as any).share = vi
				.fn()
				.mockRejectedValue(new Error("cancelled"));
			(navigator as any).canShare = vi.fn().mockReturnValue(true);

			const blob = new Blob(["test"], { type: "video/mp4" });
			const result = await saveExportedVideo(blob, "test.mp4");

			expect(result.success).toBe(true);
			// Should fall through to browser download
			expect(URL.createObjectURL).toHaveBeenCalled();
		});

		it("skips share when canShare returns false", async () => {
			(navigator as any).share = vi.fn();
			(navigator as any).canShare = vi.fn().mockReturnValue(false);

			const blob = new Blob(["test"], { type: "video/mp4" });
			const result = await saveExportedVideo(blob, "test.mp4");

			expect(result.success).toBe(true);
			expect((navigator as any).share).not.toHaveBeenCalled();
		});
	});

	describe("saveExportedVideo (Capacitor path)", () => {
		it("does not use Capacitor when not available", async () => {
			delete (window as any).Capacitor;
			const blob = new Blob(["test"], { type: "video/mp4" });
			const result = await saveExportedVideo(blob, "test.mp4");

			// Should use browser download, not Capacitor
			expect(result.success).toBe(true);
			expect(URL.createObjectURL).toHaveBeenCalled();
		});

		it("uses Capacitor Filesystem when available", async () => {
			(window as any).Capacitor = {
				isNativePlatform: () => true,
			};
			mockWriteFile.mockResolvedValue({ uri: "file:///docs/QCut/test.mp4" });

			const blob = new Blob(["test"], { type: "video/mp4" });
			const result = await saveExportedVideo(blob, "test.mp4");

			expect(result.success).toBe(true);
			expect(result.filePath).toBe("file:///docs/QCut/test.mp4");
			expect(mockWriteFile).toHaveBeenCalledWith(
				expect.objectContaining({
					path: "QCut/test.mp4",
					directory: "DOCUMENTS",
					recursive: true,
				})
			);
		});

		it("sanitizes path traversal in filename", async () => {
			(window as any).Capacitor = {
				isNativePlatform: () => true,
			};
			mockWriteFile.mockResolvedValue({ uri: "file:///docs/QCut/evil.mp4" });

			const blob = new Blob(["test"], { type: "video/mp4" });
			await saveExportedVideo(blob, "../../evil.mp4");

			expect(mockWriteFile).toHaveBeenCalledWith(
				expect.objectContaining({
					path: "QCut/evil.mp4",
				})
			);
		});

		it("falls back to browser download when Capacitor write fails", async () => {
			(window as any).Capacitor = {
				isNativePlatform: () => true,
			};
			mockWriteFile.mockRejectedValue(new Error("disk full"));

			const blob = new Blob(["test"], { type: "video/mp4" });
			const result = await saveExportedVideo(blob, "test.mp4");

			// Should fall back to browser download
			expect(result.success).toBe(true);
			expect(URL.createObjectURL).toHaveBeenCalled();
		});
	});

	describe("shareExportedVideo", () => {
		it("returns error when Capacitor is not available", async () => {
			delete (window as any).Capacitor;
			const result = await shareExportedVideo("file:///test.mp4");

			expect(result.success).toBe(false);
			expect(result.error).toBe("Share not available in browser");
		});

		it("shares via Capacitor Share plugin", async () => {
			(window as any).Capacitor = {
				isNativePlatform: () => true,
			};
			mockShareShare.mockResolvedValue(undefined);

			const result = await shareExportedVideo("file:///test.mp4");

			expect(result.success).toBe(true);
			expect(result.filePath).toBe("file:///test.mp4");
		});

		it("returns error when share fails", async () => {
			(window as any).Capacitor = {
				isNativePlatform: () => true,
			};
			mockShareShare.mockRejectedValue(new Error("share cancelled"));

			const result = await shareExportedVideo("file:///test.mp4");

			expect(result.success).toBe(false);
			expect(result.error).toBe("share cancelled");
		});
	});
});
