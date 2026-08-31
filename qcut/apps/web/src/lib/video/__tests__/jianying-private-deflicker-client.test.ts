import { afterEach, describe, expect, it, vi } from "vitest";
import { exportJianyingPrivateDeflicker } from "../jianying-private-deflicker-client";

function installElectronAPI({
	available = true,
}: {
	available?: boolean;
} = {}) {
	const result = {
		cacheHit: false,
		durationSeconds: 3,
		fps: 30,
		frameCount: 90,
		hasAudio: true,
		height: 1080,
		outputPath: "/cache/deflicker.mp4",
		provider: "jianying-private-cache",
		route: "qcut-jianying-private-deflicker-v2",
		runtime: {
			appVersion: "11.3.0",
			deflickerModelSha256: "model",
			lensSha256: "lens",
			localOnly: true,
		},
		strength: 72,
		width: 1920,
	} as const;
	const deflicker = vi.fn().mockResolvedValue(result);
	const inspect = vi.fn().mockResolvedValue({
		available,
		message: available ? "ready" : "cache missing",
	});
	const cancel = vi.fn().mockResolvedValue(undefined);
	const unsubscribe = vi.fn();
	const onProgress = vi.fn().mockReturnValue(unsubscribe);
	const readFile = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
	Object.defineProperty(window, "electronAPI", {
		configurable: true,
		value: {
			getPathForFile: vi.fn().mockReturnValue("/media/source.mp4"),
			jianyingBasicVideo: { cancel, deflicker, inspect, onProgress },
			readFile,
		},
	});
	return {
		cancel,
		deflicker,
		inspect,
		onProgress,
		readFile,
		result,
		unsubscribe,
	};
}

describe("exportJianyingPrivateDeflicker", () => {
	afterEach(() => {
		Reflect.deleteProperty(window, "electronAPI");
	});

	it("renders through the verified local cache and returns an MP4 file", async () => {
		const api = installElectronAPI();
		const exported = await exportJianyingPrivateDeflicker({
			file: new File(["video"], "source.mov", { type: "video/quicktime" }),
			strength: 72,
		});

		expect(api.deflicker).toHaveBeenCalledWith({
			sourcePath: "/media/source.mp4",
			strength: 72,
			taskId: expect.any(String),
		});
		expect(api.readFile).toHaveBeenCalledWith("/cache/deflicker.mp4");
		expect(exported.file.name).toBe("source-deflicker.mp4");
		expect(exported.file.type).toBe("video/mp4");
		expect(exported.runtime).toEqual(api.result);
		expect(api.unsubscribe).toHaveBeenCalledOnce();
	});

	it("stops before processing when the private cache is unavailable", async () => {
		const api = installElectronAPI({ available: false });

		await expect(
			exportJianyingPrivateDeflicker({
				file: new File(["video"], "source.mp4", { type: "video/mp4" }),
				strength: 70,
			})
		).rejects.toThrow("cache missing");
		expect(api.deflicker).not.toHaveBeenCalled();
		expect(api.unsubscribe).toHaveBeenCalledOnce();
	});

	it("cancels the native task when the caller aborts", async () => {
		const api = installElectronAPI();
		const controller = new AbortController();
		api.deflicker.mockImplementation(
			() =>
				new Promise((resolve) => {
					controller.abort();
					resolve(api.result);
				})
		);

		await expect(
			exportJianyingPrivateDeflicker({
				file: new File(["video"], "source.mp4", { type: "video/mp4" }),
				signal: controller.signal,
				strength: 70,
			})
		).rejects.toMatchObject({ name: "AbortError" });
		expect(api.cancel).toHaveBeenCalledWith({ taskId: expect.any(String) });
	});
});
