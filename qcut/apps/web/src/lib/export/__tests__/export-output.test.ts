import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Capacitor modules that may not be installed
vi.mock("@capacitor/share", () => ({
	Share: { share: vi.fn() },
}));

vi.mock("@capacitor/filesystem", () => ({
	Filesystem: { writeFile: vi.fn() },
	Directory: { Documents: "DOCUMENTS" },
}));

import { saveExportedVideo } from "../export-output";

describe("export-output", () => {
	let originalCreateObjectURL: typeof URL.createObjectURL;
	let originalRevokeObjectURL: typeof URL.revokeObjectURL;

	beforeEach(() => {
		originalCreateObjectURL = URL.createObjectURL;
		originalRevokeObjectURL = URL.revokeObjectURL;

		URL.createObjectURL = vi.fn().mockReturnValue("blob:test-url");
		URL.revokeObjectURL = vi.fn();

		// Ensure Capacitor is NOT available (browser fallback)
		delete (window as any).Capacitor;
	});

	afterEach(() => {
		URL.createObjectURL = originalCreateObjectURL;
		URL.revokeObjectURL = originalRevokeObjectURL;
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

	describe("saveExportedVideo (Capacitor path)", () => {
		it("does not use Capacitor when not available", async () => {
			delete (window as any).Capacitor;
			const blob = new Blob(["test"], { type: "video/mp4" });
			const result = await saveExportedVideo(blob, "test.mp4");

			// Should use browser download, not Capacitor
			expect(result.success).toBe(true);
			expect(URL.createObjectURL).toHaveBeenCalled();
		});
	});
});
