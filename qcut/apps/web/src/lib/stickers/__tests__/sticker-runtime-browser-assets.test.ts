import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import {
	clearBrowserStickerRuntimeCaches,
	createBrowserStickerRuntimeAssetResolver,
	GIF_FRAME_CACHE_LIMIT_PER_SOURCE,
	VIDEO_FRAME_WAIT_TIMEOUT_MS,
} from "../sticker-runtime-browser-assets";

interface VideoHarness {
	emitLoadedData: () => void;
	seekTargets: number[];
	video: HTMLVideoElement;
}

function installVideoHarness({
	autoSeeked = true,
	durationSeconds = 1,
}: {
	autoSeeked?: boolean;
	durationSeconds?: number;
} = {}): VideoHarness {
	const originalCreateElement = document.createElement.bind(document);
	const video = originalCreateElement("video");
	const seekTargets: number[] = [];
	let currentTimeSeconds = 0;
	let readyState: number = HTMLMediaElement.HAVE_METADATA;
	Object.defineProperties(video, {
		currentTime: {
			configurable: true,
			get: () => currentTimeSeconds,
			set: (value: number) => {
				currentTimeSeconds = value;
				seekTargets.push(value);
				if (autoSeeked) {
					queueMicrotask(() => video.dispatchEvent(new Event("seeked")));
				}
			},
		},
		duration: { configurable: true, get: () => durationSeconds },
		load: { configurable: true, value: vi.fn() },
		readyState: { configurable: true, get: () => readyState },
		videoHeight: { configurable: true, get: () => 2 },
		videoWidth: { configurable: true, get: () => 3 },
	});
	vi.spyOn(document, "createElement").mockImplementation(((
		tagName: string,
		options?: ElementCreationOptions
	) =>
		tagName === "video"
			? video
			: originalCreateElement(
					tagName,
					options
				)) as typeof document.createElement);
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
		function (this: HTMLCanvasElement) {
			return {
				drawImage: (source: CanvasImageSource) => {
					Reflect.set(
						this,
						"stickerRuntimeSnapshotTime",
						(source as HTMLVideoElement).currentTime
					);
				},
			} as unknown as CanvasRenderingContext2D;
		} as never
	);
	return {
		emitLoadedData: () => {
			readyState = HTMLMediaElement.HAVE_CURRENT_DATA;
			video.dispatchEvent(new Event("loadeddata"));
		},
		seekTargets,
		video,
	};
}

function capturedSnapshotTime({
	asset,
}: {
	asset: Awaited<
		ReturnType<
			ReturnType<typeof createBrowserStickerRuntimeAssetResolver>["resolve"]
		>
	>;
}): number {
	return Reflect.get(
		asset.image as object,
		"stickerRuntimeSnapshotTime"
	) as number;
}

async function flushVideoCreation(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe("browser sticker runtime GIF cache", () => {
	afterEach(() => {
		clearBrowserStickerRuntimeCaches();
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("closes the least-recently-used VideoFrame when a GIF exceeds its frame budget", async () => {
		const closeFrames = Array.from(
			{ length: GIF_FRAME_CACHE_LIMIT_PER_SOURCE + 1 },
			() => vi.fn()
		);
		class FakeImageDecoder {
			tracks = {
				ready: Promise.resolve(),
				selectedTrack: { frameCount: closeFrames.length },
			};

			decode({ frameIndex }: { frameIndex: number }) {
				return Promise.resolve({
					image: {
						close: closeFrames[frameIndex],
						displayHeight: 1,
						displayWidth: 1,
					},
				});
			}

			close() {}
		}
		vi.stubGlobal("ImageDecoder", FakeImageDecoder);
		const mediaItem = {
			id: "large-gif",
			name: "large.gif",
			type: "image",
			file: new File([new Uint8Array([1])], "large.gif", {
				type: "image/gif",
			}),
		} satisfies MediaItem;
		const assets = createBrowserStickerRuntimeAssetResolver({ mediaItem });

		await Promise.all(
			closeFrames.map((_, frameIndex) =>
				assets.resolve({
					request: { kind: "direct-gif-frame", frameIndex },
				})
			)
		);
		await Promise.resolve();

		expect(closeFrames[0]).toHaveBeenCalledOnce();
		expect(
			closeFrames.slice(1).every((close) => close.mock.calls.length === 0)
		).toBe(true);
	});

	it("waits for frame data and snapshots time zero without waiting for seeked", async () => {
		const harness = installVideoHarness({ autoSeeked: false });
		const mediaItem = {
			id: "alpha-zero",
			name: "alpha-zero.webm",
			type: "video",
			file: new File([], "alpha-zero.webm", { type: "video/webm" }),
			url: "blob:alpha-zero",
		} satisfies MediaItem;
		const assets = createBrowserStickerRuntimeAssetResolver({ mediaItem });
		const framePromise = assets.resolve({
			request: {
				kind: "alpha-video-frame",
				source: "$primary",
				sourceTimeSeconds: 0,
			},
		});
		await flushVideoCreation();
		let settled = false;
		void framePromise.then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);

		harness.emitLoadedData();
		const frame = await framePromise;

		expect(harness.seekTargets).toEqual([]);
		expect(capturedSnapshotTime({ asset: frame })).toBe(0);
		expect([frame.width, frame.height]).toEqual([3, 2]);
	});

	it("serializes same-source seeks and returns immutable frame snapshots", async () => {
		const harness = installVideoHarness();
		const mediaItem = {
			id: "alpha-concurrent",
			name: "alpha-concurrent.webm",
			type: "video",
			file: new File([], "alpha-concurrent.webm", { type: "video/webm" }),
			url: "blob:alpha-concurrent",
		} satisfies MediaItem;
		const assets = createBrowserStickerRuntimeAssetResolver({ mediaItem });
		const firstPromise = assets.resolve({
			request: {
				kind: "alpha-video-frame",
				source: "$primary",
				sourceTimeSeconds: 0.25,
			},
		});
		const secondPromise = assets.resolve({
			request: {
				kind: "alpha-video-frame",
				source: "$primary",
				sourceTimeSeconds: 0.75,
			},
		});
		await flushVideoCreation();
		harness.emitLoadedData();

		const [first, second] = await Promise.all([firstPromise, secondPromise]);

		expect(harness.seekTargets).toEqual([0.25, 0.75]);
		expect(first.image).not.toBe(second.image);
		expect(capturedSnapshotTime({ asset: first })).toBe(0.25);
		expect(capturedSnapshotTime({ asset: second })).toBe(0.75);
		expect(capturedSnapshotTime({ asset: first })).toBe(0.25);
	});

	it("seeks when a requested time only differs by a sub-microsecond", async () => {
		const harness = installVideoHarness();
		const mediaItem = {
			id: "alpha-exact-seek",
			name: "alpha-exact-seek.webm",
			type: "video",
			file: new File([], "alpha-exact-seek.webm", { type: "video/webm" }),
			url: "blob:alpha-exact-seek",
		} satisfies MediaItem;
		const assets = createBrowserStickerRuntimeAssetResolver({ mediaItem });
		const firstPromise = assets.resolve({
			request: {
				kind: "alpha-video-frame",
				source: "$primary",
				sourceTimeSeconds: 0.25,
			},
		});
		await flushVideoCreation();
		harness.emitLoadedData();
		await firstPromise;

		const second = await assets.resolve({
			request: {
				kind: "alpha-video-frame",
				source: "$primary",
				sourceTimeSeconds: 0.250_000_5,
			},
		});

		expect(harness.seekTargets).toEqual([0.25, 0.250_000_5]);
		expect(capturedSnapshotTime({ asset: second })).toBe(0.250_000_5);
	});

	it("times out when an in-range seek never completes", async () => {
		vi.useFakeTimers();
		const harness = installVideoHarness({ autoSeeked: false });
		const mediaItem = {
			id: "alpha-timeout",
			name: "alpha-timeout.webm",
			type: "video",
			file: new File([], "alpha-timeout.webm", { type: "video/webm" }),
			url: "blob:alpha-timeout",
		} satisfies MediaItem;
		const assets = createBrowserStickerRuntimeAssetResolver({ mediaItem });
		const framePromise = assets.resolve({
			request: {
				kind: "alpha-video-frame",
				source: "$primary",
				sourceTimeSeconds: 0.5,
			},
		});
		const rejection = expect(framePromise).rejects.toThrow(
			"Timed out while seeking sticker video frame"
		);
		await flushVideoCreation();
		harness.emitLoadedData();
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(VIDEO_FRAME_WAIT_TIMEOUT_MS);

		await rejection;
	});

	it("times out when the video never exposes current frame data", async () => {
		vi.useFakeTimers();
		installVideoHarness();
		const mediaItem = {
			id: "alpha-load-timeout",
			name: "alpha-load-timeout.webm",
			type: "video",
			file: new File([], "alpha-load-timeout.webm", { type: "video/webm" }),
			url: "blob:alpha-load-timeout",
		} satisfies MediaItem;
		const assets = createBrowserStickerRuntimeAssetResolver({ mediaItem });
		const framePromise = assets.resolve({
			request: {
				kind: "alpha-video-frame",
				source: "$primary",
				sourceTimeSeconds: 0,
			},
		});
		const rejection = expect(framePromise).rejects.toThrow(
			"Timed out while loading sticker video"
		);
		await flushVideoCreation();
		await vi.advanceTimersByTimeAsync(VIDEO_FRAME_WAIT_TIMEOUT_MS);

		await rejection;
	});

	it("allows the exact duration endpoint but rejects any later time", async () => {
		const harness = installVideoHarness({ durationSeconds: 1 });
		const mediaItem = {
			id: "alpha-endpoint",
			name: "alpha-endpoint.webm",
			type: "video",
			file: new File([], "alpha-endpoint.webm", { type: "video/webm" }),
			url: "blob:alpha-endpoint",
		} satisfies MediaItem;
		const assets = createBrowserStickerRuntimeAssetResolver({ mediaItem });
		const endpointPromise = assets.resolve({
			request: {
				kind: "alpha-video-frame",
				source: "$primary",
				sourceTimeSeconds: 1,
			},
		});
		await flushVideoCreation();
		harness.emitLoadedData();
		const endpoint = await endpointPromise;

		expect(harness.seekTargets[0]).toBeCloseTo(0.999_999, 9);
		expect(capturedSnapshotTime({ asset: endpoint })).toBeCloseTo(0.999_999, 9);
		await expect(
			assets.resolve({
				request: {
					kind: "alpha-video-frame",
					source: "$primary",
					sourceTimeSeconds: 1.000_000_5,
				},
			})
		).rejects.toThrow("exceeds duration");
	});

	it("rejects non-persisted secondary source URLs", async () => {
		const mediaItem = {
			id: "atlas-primary",
			name: "atlas-primary.png",
			type: "image",
			file: new File([], "atlas-primary.png", { type: "image/png" }),
			url: "blob:atlas-primary",
		} satisfies MediaItem;
		const assets = createBrowserStickerRuntimeAssetResolver({ mediaItem });

		await expect(
			assets.resolve({
				request: {
					kind: "atlas",
					source: "blob:session-only-secondary",
				},
			})
		).rejects.toThrow("$resource:<name>");
	});
});
