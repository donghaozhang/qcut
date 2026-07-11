import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

describe("BlobManager", () => {
	let createObjectUrlMock: ReturnType<typeof vi.fn>;
	let revokeObjectUrlMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.resetModules();
		vi.useFakeTimers();
		createObjectUrlMock = vi.fn(() => "blob:transition-preview");
		revokeObjectUrlMock = vi.fn();
		URL.createObjectURL = createObjectUrlMock as typeof URL.createObjectURL;
		URL.revokeObjectURL = revokeObjectUrlMock as typeof URL.revokeObjectURL;
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		URL.createObjectURL = originalCreateObjectURL;
		URL.revokeObjectURL = originalRevokeObjectURL;
	});

	it("keeps a cached URL alive when the next preview acquires it during grace", async () => {
		const { BLOB_RELEASE_GRACE_MS, blobManager } = await import(
			"../blob-manager"
		);
		const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
		const firstUrl = blobManager.getOrCreateObjectURL(file, "outgoing-preview");

		blobManager.releaseObjectURL(firstUrl, "outgoing-unmount");
		vi.advanceTimersByTime(BLOB_RELEASE_GRACE_MS / 2);
		const reusedUrl = blobManager.getOrCreateObjectURL(
			file,
			"incoming-preview"
		);
		vi.advanceTimersByTime(BLOB_RELEASE_GRACE_MS);

		expect(reusedUrl).toBe(firstUrl);
		expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
		expect(revokeObjectUrlMock).not.toHaveBeenCalled();

		blobManager.releaseObjectURL(reusedUrl, "incoming-unmount");
		vi.advanceTimersByTime(BLOB_RELEASE_GRACE_MS);
		expect(revokeObjectUrlMock).toHaveBeenCalledOnce();
		expect(revokeObjectUrlMock).toHaveBeenCalledWith(firstUrl);
	});

	it("still force-revokes temporary URLs immediately", async () => {
		const { blobManager } = await import("../blob-manager");
		const file = new File(["frame"], "frame.png", { type: "image/png" });
		const url = blobManager.createObjectURL(file, "temporary-frame");

		blobManager.revokeObjectURL(url, "temporary-frame-complete");

		expect(revokeObjectUrlMock).toHaveBeenCalledOnce();
		expect(revokeObjectUrlMock).toHaveBeenCalledWith(url);
	});
});
