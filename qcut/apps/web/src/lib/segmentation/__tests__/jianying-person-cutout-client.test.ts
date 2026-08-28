import { afterEach, describe, expect, it, vi } from "vitest";
import { exportJianyingPersonCutout } from "../jianying-person-cutout-client";

const settings = {
	threshold: 0.5,
	temporalSmoothing: 0.65,
	edgeShift: 0,
	feather: 2,
};

function installElectronAPI({
	available = true,
}: {
	available?: boolean;
} = {}) {
	const inspect = vi.fn().mockResolvedValue({
		available,
		blendImplementation: "TEMattingBlendEffectV2-compatible",
		message: available ? "精细抠像已就绪" : "精细抠像不可用",
		nativeMetalCanaryEnabled: true,
		offlineReady: available,
		pipelineId: "qcut-gru-vision-fusion-v1",
		provider: "qcut-local-person-matting-v1",
		refinementProvider: "qcut-portrait-temporal-border-refinement-v1",
	});
	const renderResult = {
		blendImplementation: "TEMattingBlendEffectV2-compatible",
		didModelRouteFallback: false,
		modelRoute: "portrait-gru",
		nativeMetalCanary: "passed",
		pipelineId: "qcut-gru-vision-fusion-v1",
		provider: "qcut-local-person-matting-v1",
		refinementProvider: "qcut-portrait-temporal-border-refinement-v1",
		requestedModelRoute: "auto",
		outputPath: "/tmp/person-cutout.webm",
		width: 360,
		height: 640,
		duration: 2,
		frameRate: 30,
		frameCount: 60,
		hasAudio: false,
		codec: "vp9",
	} as const;
	const render = vi.fn().mockResolvedValue(renderResult);
	const readFile = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
	const release = vi.fn().mockResolvedValue(undefined);
	const cancel = vi.fn().mockResolvedValue(undefined);
	const unsubscribeProgress = vi.fn();
	const onProgress = vi.fn().mockReturnValue(unsubscribeProgress);
	Object.defineProperty(window, "electronAPI", {
		configurable: true,
		value: {
			getPathForFile: vi.fn().mockReturnValue("/tmp/source.mp4"),
			readFile,
			jianyingPersonCutout: {
				cancel,
				inspect,
				onProgress,
				render,
				release,
			},
		},
	});
	return {
		cancel,
		inspect,
		onProgress,
		readFile,
		render,
		renderResult,
		release,
		unsubscribeProgress,
	};
}

describe("exportJianyingPersonCutout", () => {
	afterEach(() => {
		Reflect.deleteProperty(window, "electronAPI");
	});

	it("renders through the cached GRU provider and releases its temporary file", async () => {
		const api = installElectronAPI();
		const progress = vi.fn();
		const result = await exportJianyingPersonCutout({
			file: new File(["video"], "source.mp4", { type: "video/mp4" }),
			settings,
			onProgress: progress,
		});

		expect(api.render).toHaveBeenCalledWith({
			sourcePath: "/tmp/source.mp4",
			settings,
			taskId: expect.any(String),
		});
		expect(result.blob.type).toBe("video/webm");
		expect(result.frameCount).toBe(60);
		expect(result.blendImplementation).toBe(
			"TEMattingBlendEffectV2-compatible"
		);
		expect(result).toMatchObject({
			didModelRouteFallback: false,
			modelRoute: "portrait-gru",
			nativeMetalCanary: "passed",
			pipelineId: "qcut-gru-vision-fusion-v1",
			provider: "qcut-local-person-matting-v1",
			refinementProvider: "qcut-portrait-temporal-border-refinement-v1",
			requestedModelRoute: "auto",
		});
		expect(api.release).toHaveBeenCalledWith({
			outputPath: "/tmp/person-cutout.webm",
		});
		expect(progress).toHaveBeenLastCalledWith({
			progress: 100,
			status: "人物抠像已完成",
		});
		expect(api.unsubscribeProgress).toHaveBeenCalledOnce();
	});

	it("prefers the project-owned source path for restored media", async () => {
		const api = installElectronAPI();
		await exportJianyingPersonCutout({
			file: new File(["video"], "source.mp4", { type: "video/mp4" }),
			sourcePath: "/project/media/source.mp4",
			settings,
		});

		expect(api.render).toHaveBeenCalledWith({
			sourcePath: "/project/media/source.mp4",
			settings,
			taskId: expect.any(String),
		});
	});

	it("releases the rendered output when cancellation arrives after render", async () => {
		const controller = new AbortController();
		const api = installElectronAPI();
		api.render.mockImplementation(async () => {
			controller.abort();
			return api.renderResult;
		});

		await expect(
			exportJianyingPersonCutout({
				file: new File(["video"], "source.mp4", { type: "video/mp4" }),
				settings,
				signal: controller.signal,
			})
		).rejects.toMatchObject({ name: "AbortError" });
		expect(api.release).toHaveBeenCalledWith({
			outputPath: api.renderResult.outputPath,
		});
		expect(api.readFile).not.toHaveBeenCalled();
	});

	it("releases the rendered output when reading it fails", async () => {
		const api = installElectronAPI();
		api.readFile.mockRejectedValueOnce(new Error("read failed"));

		await expect(
			exportJianyingPersonCutout({
				file: new File(["video"], "source.mp4", { type: "video/mp4" }),
				settings,
			})
		).rejects.toThrow("read failed");
		expect(api.release).toHaveBeenCalledWith({
			outputPath: api.renderResult.outputPath,
		});
	});

	it("reports the private runtime status before rendering", async () => {
		const api = installElectronAPI({ available: false });

		await expect(
			exportJianyingPersonCutout({
				file: new File(["video"], "source.mp4", { type: "video/mp4" }),
				settings,
			})
		).rejects.toThrow("精细抠像不可用");
		expect(api.render).not.toHaveBeenCalled();
		expect(api.unsubscribeProgress).toHaveBeenCalledOnce();
	});

	it("cancels the native pipeline when the caller aborts", async () => {
		const api = installElectronAPI();
		const controller = new AbortController();
		api.render.mockImplementation(
			() =>
				new Promise((resolve) => {
					controller.signal.addEventListener(
						"abort",
						() => resolve(undefined),
						{
							once: true,
						}
					);
				})
		);
		const pending = exportJianyingPersonCutout({
			file: new File(["video"], "source.mp4", { type: "video/mp4" }),
			settings,
			signal: controller.signal,
		});
		await Promise.resolve();
		controller.abort();
		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		expect(api.cancel).toHaveBeenCalledWith({ taskId: expect.any(String) });
		expect(api.unsubscribeProgress).toHaveBeenCalledOnce();
	});
});
