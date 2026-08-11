import { describe, expect, it, vi } from "vitest";
import type { TextElement, TimelineTrack } from "@/types/timeline";
import type { JianyingTextRuntimeRenderRequest } from "@/types/electron";
import { resolveAnimatedTextElement } from "@/lib/text/text-element-animation";
import {
	extractTextRasterSources,
	type CreateTextRasterFrameCanvas,
	usesTextRasterExport,
} from "../text-raster-sources";
import { resetLocalFontRuntimeForTests } from "@/lib/fonts/local-font-runtime";

function createTextElement({
	animated = true,
}: {
	animated?: boolean;
} = {}): TextElement {
	return {
		id: "animated-title",
		name: "Animated title",
		type: "text",
		content: "Hello",
		startTime: 2,
		duration: 1,
		trimStart: 0.11,
		trimEnd: 0.39,
		fontSize: 48,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		blendMode: "multiply",
		animationType: "fade",
		textAnimations: animated
			? {
					schemaVersion: 1,
					entrance: {
						timing: { duration: 0.5, delay: 0, easing: "easeOut" },
						sequence: {
							unit: "grapheme",
							order: "forward",
							staggerRatio: 0.5,
							seed: 1,
						},
						target: "text",
						effect: { kind: "fade", minimumOpacity: 0 },
					},
				}
			: undefined,
	};
}

function tracksWithText({
	element,
}: {
	element: TextElement;
}): TimelineTrack[] {
	return [
		{
			id: "text-track",
			type: "text",
			order: 4,
			elements: [element],
		},
	] as TimelineTrack[];
}

function tracksWithTrackedText({
	element,
}: {
	element: TextElement;
}): TimelineTrack[] {
	return [
		{
			id: "media-track",
			type: "media",
			order: 1,
			elements: [
				{
					id: "tracking-target",
					name: "Tracking target",
					type: "media",
					mediaId: "media-1",
					startTime: 0,
					duration: 10,
					trimStart: 0,
					trimEnd: 0,
					x: 100,
					y: 50,
					width: 640,
					height: 360,
					rotation: 10,
					opacity: 1,
					volume: 1,
				},
			],
		},
		{
			id: "text-track",
			type: "text",
			order: 4,
			elements: [element],
		},
	] as TimelineTrack[];
}

function createStubCanvas({
	onCreate,
}: {
	onCreate?: ({ width, height }: { width: number; height: number }) => void;
} = {}): CreateTextRasterFrameCanvas {
	const context = {
		clearRect: vi.fn(),
		save: vi.fn(),
		translate: vi.fn(),
		restore: vi.fn(),
	} as unknown as OffscreenCanvasRenderingContext2D;
	return ({ width, height }) => {
		onCreate?.({ width, height });
		return {
			width,
			height,
			getContext: () => context,
			convertToBlob: async () =>
				new Blob([new Uint8Array([137, 80, 78, 71])], {
					type: "image/png",
				}),
		};
	};
}

function createSaveMock() {
	return vi.fn(
		async ({
			sequenceId,
			frameIndex,
		}: {
			sessionId: string;
			sequenceId: string;
			frameIndex: number;
			imageData: Uint8Array;
		}) => ({
			success: true,
			path: `/tmp/effect-sequences/${sequenceId}/f_${String(frameIndex).padStart(5, "0")}.png`,
			patternPath: `/tmp/effect-sequences/${sequenceId}/f_%05d.png`,
		})
	);
}

describe("extractTextRasterSources", () => {
	it("renders an original Jianying package as a native transparent sequence", async () => {
		const element = createTextElement({ animated: false });
		element.width = 480;
		element.height = 320;
		element.jianyingTextStyle = {
			schemaVersion: 1,
			source: "jianying-cache",
			packageKind: "ScriptInfoSticker",
			resourceId: "7280819425605930279",
			packageHash: "f46ef1dfceca013a755b566632c150bf",
			editMode: "runtime-with-preload-fallback",
			slotMapping: "line-to-widget",
			timeMapping: "stretch",
			templateDuration: 3,
		};
		const render = vi.fn(async (request: JianyingTextRuntimeRenderRequest) => ({
			requestId: request.requestId,
			resourceId: element.jianyingTextStyle!.resourceId,
			packageHash: element.jianyingTextStyle!.packageHash,
			templateDuration: 3,
			frameCount: request.frameCount,
			strategy: "preload-copy" as const,
			cacheHit: false,
			x: 80,
			y: 20,
			source: {
				kind: "image-sequence" as const,
				path: "/tmp/jianying/frame-%06d.png",
				frameRate: 10,
			},
		}));
		window.electronAPI = {
			jianyingTextRuntime: {
				inspect: vi.fn(),
				render,
				cancel: vi.fn(async () => true),
			},
		} as never;
		const saveEffectSequenceFrame = createSaveMock();

		const result = await extractTextRasterSources({
			tracks: tracksWithText({ element }),
			sessionId: "session-jianying",
			canvasWidth: 640,
			canvasHeight: 360,
			fps: 10,
			api: { saveEffectSequenceFrame },
			createCanvas: createStubCanvas(),
			renderFrame: vi.fn(),
			logger: vi.fn(),
		});

		expect(saveEffectSequenceFrame).not.toHaveBeenCalled();
		const runtimeRequest = render.mock.calls[0]?.[0];
		expect(runtimeRequest).toEqual(
			expect.objectContaining({
				content: "Hello",
				canvasWidth: 640,
				canvasHeight: 360,
				elementDuration: 1,
				frameCount: 5,
				fps: 10,
				transform: expect.objectContaining({ width: 480, height: 320 }),
			})
		);
		expect(runtimeRequest?.sourceStart).toBeCloseTo(0.2, 10);
		expect(result).toEqual([
			expect.objectContaining({
				elementId: "animated-title",
				x: 80,
				y: 20,
				source: {
					kind: "image-sequence",
					path: "/tmp/jianying/frame-%06d.png",
					frameRate: 10,
				},
			}),
		]);
	});

	it("bakes a static local font once and emits a looping image layer", async () => {
		resetLocalFontRuntimeForTests();
		const element = createTextElement({ animated: false });
		element.animationType = "none";
		element.fontFamily = "QCutLocal_aaaaaaaaaaaaaaaaaaaa";
		element.fontAsset = {
			kind: "local-font",
			source: "jianying-cache",
			assetId: `sha256:${"a".repeat(64)}`,
			cssFamily: element.fontFamily,
			familyName: "文悦新青年体",
			fullName: "文悦新青年体 W8",
			postscriptName: "WenYue-XinQingNianTi-W8",
		};
		class FakeFontFace {
			load = vi.fn(async () => this);
		}
		vi.stubGlobal("FontFace", FakeFontFace);
		Object.defineProperty(document, "fonts", {
			configurable: true,
			value: {
				add: vi.fn(),
				delete: vi.fn(),
				ready: Promise.resolve(),
				load: vi.fn(async () => []),
			},
		});
		window.electronAPI = {
			jianyingFontLab: {
				list: vi.fn(),
				inspect: vi.fn(),
				load: vi.fn(async () => ({
					font: {
						fontId: element.fontAsset?.assetId,
						cssFamily: element.fontFamily,
						familyName: "文悦新青年体",
						fullName: "文悦新青年体 W8",
						postscriptName: "WenYue-XinQingNianTi-W8",
						subfamilyName: "Regular",
						format: "ttf",
						size: 4,
						sourceKinds: ["effect"],
					},
					bytes: new Uint8Array([0, 1, 2, 3]),
				})),
			},
		} as never;
		const saveEffectSequenceFrame = createSaveMock();

		expect(usesTextRasterExport({ element, fps: 30 })).toBe(true);
		const result = await extractTextRasterSources({
			tracks: tracksWithText({ element }),
			sessionId: "session-local-font",
			canvasWidth: 640,
			canvasHeight: 360,
			fps: 30,
			api: { saveEffectSequenceFrame },
			createCanvas: createStubCanvas(),
			renderFrame: vi.fn(),
			logger: vi.fn(),
		});

		expect(saveEffectSequenceFrame).toHaveBeenCalledTimes(1);
		expect(result[0].source).toEqual({
			kind: "image",
			path: "/tmp/effect-sequences/text-p-animated-title/f_00000.png",
		});
	});

	it("bakes canonical text animations at output fps and preserves layer order", async () => {
		const saveEffectSequenceFrame = createSaveMock();
		const renderFrame = vi.fn();
		const progress: number[] = [];

		const result = await extractTextRasterSources({
			tracks: tracksWithText({ element: createTextElement() }),
			sessionId: "session-1",
			canvasWidth: 640,
			canvasHeight: 360,
			fps: 10,
			api: { saveEffectSequenceFrame },
			createCanvas: createStubCanvas(),
			renderFrame,
			logger: vi.fn(),
			onProgress: ({ bakedFrames }) => progress.push(bakedFrames),
		});

		expect(saveEffectSequenceFrame).toHaveBeenCalledTimes(5);
		expect(renderFrame).toHaveBeenCalledTimes(5);
		expect(renderFrame.mock.calls.map(([call]) => call.currentTime)).toEqual([
			2.2, 2.3000000000000003, 2.4000000000000004, 2.5, 2.6,
		]);
		expect(renderFrame.mock.calls[0][0].element.blendMode).toBe("normal");
		expect(progress).toEqual([1, 2, 3, 4, 5]);
		expect(result).toEqual([
			expect.objectContaining({
				elementId: "animated-title",
				source: {
					kind: "image-sequence",
					path: "/tmp/effect-sequences/text-p-animated-title/f_%05d.png",
					frameRate: 10,
				},
				startTime: 2.2,
				endTime: 2.7,
				blendMode: "multiply",
				x: expect.any(Number),
				y: expect.any(Number),
				trackOrder: 0,
				elementOrder: 0,
			}),
		]);
	});

	it("keeps legacy-only animation text on the ASS path", async () => {
		const saveEffectSequenceFrame = createSaveMock();
		const result = await extractTextRasterSources({
			tracks: tracksWithText({
				element: createTextElement({ animated: false }),
			}),
			sessionId: "session-1",
			canvasWidth: 640,
			canvasHeight: 360,
			fps: 30,
			api: { saveEffectSequenceFrame },
			createCanvas: createStubCanvas(),
			renderFrame: vi.fn(),
			logger: vi.fn(),
		});

		expect(result).toEqual([]);
		expect(saveEffectSequenceFrame).not.toHaveBeenCalled();
	});

	it("resolves text tracking on every baked frame", async () => {
		const renderFrame = vi.fn();
		const element = createTextElement();
		element.x = 10;
		element.y = 20;
		element.rotation = 2;
		element.trackingTargetId = "tracking-target";
		element.trackingOffsetX = 3;
		element.trackingOffsetY = -4;
		element.trackingRotation = true;

		await extractTextRasterSources({
			tracks: tracksWithTrackedText({ element }),
			sessionId: "session-1",
			canvasWidth: 640,
			canvasHeight: 360,
			fps: 10,
			api: { saveEffectSequenceFrame: createSaveMock() },
			createCanvas: createStubCanvas(),
			renderFrame,
			logger: vi.fn(),
		});

		expect(renderFrame.mock.calls[0][0].element).toMatchObject({
			x: 113,
			y: 66,
			rotation: 12,
		});
	});

	it("matches preview geometry when text keyframes and tracking are combined", async () => {
		const renderFrame = vi.fn();
		const element = createTextElement();
		element.trackingTargetId = "tracking-target";
		element.trackingOffsetX = 3;
		element.trackingOffsetY = -4;
		element.trackingRotation = true;
		element.keyframes = {
			x: [
				{ id: "x-start", frame: 0, value: 10, easing: "linear" },
				{ id: "x-end", frame: 2, value: 40, easing: "linear" },
			],
			y: [
				{ id: "y-start", frame: 0, value: 20, easing: "linear" },
				{ id: "y-end", frame: 2, value: -10, easing: "linear" },
			],
			rotation: [
				{ id: "r-start", frame: 0, value: 2, easing: "linear" },
				{ id: "r-end", frame: 2, value: 25, easing: "linear" },
			],
		};
		const tracks = tracksWithTrackedText({ element });
		const currentTime = 2.2;
		const previewElement = resolveAnimatedTextElement({
			element,
			tracks,
			currentTime,
			fps: 10,
		});

		await extractTextRasterSources({
			tracks,
			sessionId: "session-1",
			canvasWidth: 640,
			canvasHeight: 360,
			fps: 10,
			api: { saveEffectSequenceFrame: createSaveMock() },
			createCanvas: createStubCanvas(),
			renderFrame,
			logger: vi.fn(),
		});

		expect(previewElement).toMatchObject({
			x: 143,
			y: 36,
			rotation: 35,
		});
		expect(renderFrame.mock.calls[0][0].element).toMatchObject({
			x: previewElement.x,
			y: previewElement.y,
			rotation: previewElement.rotation,
		});
	});

	it("keeps an empty canonical animation config as static ASS text", async () => {
		const element = createTextElement({ animated: false });
		element.textAnimations = { schemaVersion: 1 };
		const saveEffectSequenceFrame = createSaveMock();

		const result = await extractTextRasterSources({
			tracks: tracksWithText({ element }),
			sessionId: "session-1",
			canvasWidth: 640,
			canvasHeight: 360,
			fps: 30,
			api: { saveEffectSequenceFrame },
			createCanvas: createStubCanvas(),
			renderFrame: vi.fn(),
			logger: vi.fn(),
		});

		expect(result).toEqual([]);
		expect(saveEffectSequenceFrame).not.toHaveBeenCalled();
	});

	it("rejects unsupported canonical schemas instead of falling back", async () => {
		const element = createTextElement({ animated: false });
		element.textAnimations = {
			schemaVersion: 2,
		} as unknown as TextElement["textAnimations"];

		await expect(
			extractTextRasterSources({
				tracks: tracksWithText({ element }),
				sessionId: "session-1",
				canvasWidth: 640,
				canvasHeight: 360,
				fps: 30,
				api: { saveEffectSequenceFrame: createSaveMock() },
				createCanvas: createStubCanvas(),
				renderFrame: vi.fn(),
				logger: vi.fn(),
			})
		).rejects.toThrow(/unsupported-schema/);
	});

	it("aborts instead of dropping text when a frame cannot be saved", async () => {
		await expect(
			extractTextRasterSources({
				tracks: tracksWithText({ element: createTextElement() }),
				sessionId: "session-1",
				canvasWidth: 640,
				canvasHeight: 360,
				fps: 10,
				api: {
					saveEffectSequenceFrame: vi.fn(async () => ({
						success: false,
						error: "disk full",
					})),
				},
				createCanvas: createStubCanvas(),
				renderFrame: vi.fn(),
				logger: vi.fn(),
			})
		).rejects.toThrow("disk full");
	});
});
