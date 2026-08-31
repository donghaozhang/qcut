import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type {
	ClipTransition,
	MediaElement,
	TimelineTrack,
} from "@/types/timeline";
import { getClipTransitionLayerPresentation } from "@/lib/transitions/clip-transition-presentation";
import { resolveJianyingTransition } from "../../../../../../electron/jianying-transition-catalog";
import {
	assertCanvasClipTransitionsRenderable,
	beginClipTransitionLayer,
	buildExportClipTransitionPlan,
	classifyCanvasClipTransition,
	parseClipTransitionClipPath,
} from "../export-clip-transitions";

const CANVAS = { canvasWidth: 1280, canvasHeight: 720 };

function clip({
	id,
	startTime,
	mediaId,
}: {
	id: string;
	startTime: number;
	mediaId: string;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId,
		startTime,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
	};
}

function transition(
	overrides: Partial<ClipTransition> & Pick<ClipTransition, "id" | "type">
): ClipTransition {
	return {
		fromElementId: "a",
		toElementId: "b",
		presetId: `${overrides.type}-preset`,
		duration: 1,
		easing: "linear",
		...overrides,
	};
}

function videoItem({ id }: { id: string }): MediaItem {
	return {
		id,
		name: `${id}.mp4`,
		type: "video",
		file: new File(["x"], `${id}.mp4`, { type: "video/mp4" }),
		url: `blob:${id}`,
	};
}

interface RecordedContext extends CanvasRenderingContext2D {
	drawImageAlphas: number[];
	drawImageSources: unknown[];
}

function mockContext({
	width,
	height,
}: {
	width: number;
	height: number;
}): RecordedContext {
	const canvas = { width, height };
	const ctx = {
		canvas,
		globalAlpha: 1,
		filter: "none",
		fillStyle: "",
		drawImageAlphas: [] as number[],
		drawImageSources: [] as unknown[],
		save: vi.fn(),
		restore: vi.fn(),
		translate: vi.fn(),
		rotate: vi.fn(),
		scale: vi.fn(),
		setTransform: vi.fn(),
		clearRect: vi.fn(),
		fillRect: vi.fn(),
		beginPath: vi.fn(),
		rect: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		closePath: vi.fn(),
		clip: vi.fn(),
		drawImage: vi.fn(),
	};
	ctx.drawImage = vi.fn((source: unknown) => {
		ctx.drawImageAlphas.push(ctx.globalAlpha);
		ctx.drawImageSources.push(source);
	});
	return ctx as unknown as RecordedContext;
}

describe("parseClipTransitionClipPath", () => {
	it("parses inset percentages with unitless zeros", () => {
		expect(
			parseClipTransitionClipPath({ clipPath: "inset(0 25% 0 0)" })
		).toEqual({ kind: "inset", top: 0, right: 0.25, bottom: 0, left: 0 });
		expect(parseClipTransitionClipPath({ clipPath: "inset(10%)" })).toEqual({
			kind: "inset",
			top: 0.1,
			right: 0.1,
			bottom: 0.1,
			left: 0.1,
		});
	});

	it("parses polygons with negative and oversized percentages", () => {
		expect(
			parseClipTransitionClipPath({
				clipPath: "polygon(-1% -1%, 23.5% -1%, 48.5% 50%, 23.5% 101%)",
			})
		).toEqual({
			kind: "polygon",
			points: [
				[-0.01, -0.01],
				[0.235, -0.01],
				[0.485, 0.5],
				[0.235, 1.01],
			],
		});
	});

	it("rejects shapes canvas cannot express", () => {
		expect(
			parseClipTransitionClipPath({ clipPath: "circle(40% at 50% 50%)" })
		).toBeNull();
		expect(parseClipTransitionClipPath({ clipPath: "inset(3px)" })).toBeNull();
	});
});

describe("classifyCanvasClipTransition", () => {
	it.each([
		{ type: "dissolve" },
		{ type: "fade-black" },
		{ type: "fade-white" },
		{ type: "slide", direction: "left" },
		{ type: "push", direction: "right" },
		{ type: "wipe", direction: "up" },
		{ type: "zoom-blur" },
		{ type: "zoom-in-blur" },
		{ type: "whip-pan", direction: "right" },
		{ type: "flash" },
		{ type: "light-leak" },
		{ type: "rgb-glitch" },
		{ type: "shake" },
		{ type: "motion-blur", direction: "left" },
		{ type: "vortex" },
		{ type: "texture-mask", maskShape: "clock" },
		{ type: "texture-mask", maskShape: "arrow" },
	] as Array<
		Partial<ClipTransition> & Pick<ClipTransition, "type">
	>)("renders $type $maskShape on canvas", (overrides) => {
		expect(
			classifyCanvasClipTransition({
				transition: transition({ id: "t", ...overrides }),
				...CANVAS,
				canvasFilterSupported: true,
			})
		).toEqual({ renderable: true });
	});

	it.each([
		[{ type: "particle-dissolve" }, "CSS mask images"],
		[{ type: "glass-refraction" }, "CSS mask images"],
		[{ type: "texture-mask", maskShape: "circle" }, "CSS mask images"],
		[{ type: "texture-mask" }, "CSS mask images"],
		[{ type: "page-flip", direction: "left" }, "3D perspective transforms"],
		[{ type: "cube", direction: "left" }, "3D perspective transforms"],
		[{ type: "pixelate" }, "pixelated upscaling"],
		[{ type: "water-ripple" }, "CSS gradient overlays"],
		[{ type: "shockwave" }, "CSS gradient overlays"],
		[{ type: "lens-flare" }, "CSS gradient overlays"],
		[{ type: "color-swipe" }, "CSS gradient overlays"],
	] as Array<
		[Partial<ClipTransition> & Pick<ClipTransition, "type">, string]
	>)("refuses %o with a reason", (overrides, reason) => {
		expect(
			classifyCanvasClipTransition({
				transition: transition({ id: "t", ...overrides }),
				...CANVAS,
				canvasFilterSupported: true,
			})
		).toEqual({ renderable: false, reason });
	});

	it("needs canvas filters only for filtered presentations", () => {
		expect(
			classifyCanvasClipTransition({
				transition: transition({ id: "t", type: "zoom-blur" }),
				...CANVAS,
				canvasFilterSupported: false,
			})
		).toMatchObject({ renderable: false });
		expect(
			classifyCanvasClipTransition({
				transition: transition({ id: "t", type: "dissolve" }),
				...CANVAS,
				canvasFilterSupported: false,
			})
		).toEqual({ renderable: true });
	});
});

describe("buildExportClipTransitionPlan", () => {
	const local = resolveJianyingTransition({
		value: "jianying-local-traverse-3",
	});
	if (!local) throw new Error("Missing local Jianying transition fixture");
	const mediaItems = [videoItem({ id: "m1" }), videoItem({ id: "m2" })];
	const tracks: TimelineTrack[] = [
		{
			id: "main",
			name: "Media",
			type: "media",
			elements: [
				clip({ id: "a", startTime: 0, mediaId: "m1" }),
				clip({ id: "b", startTime: 2, mediaId: "m2" }),
				clip({ id: "c", startTime: 4, mediaId: "m1" }),
			],
			transitions: [
				transition({ id: "ab", type: "dissolve" }),
				transition({
					id: "bc",
					fromElementId: "b",
					toElementId: "c",
					type: "dissolve",
					presetId: local.id,
					engine: "jianying-local",
					packageHash: local.metadataMd5,
				}),
			],
		},
		{
			id: "overlay",
			name: "Overlay",
			type: "media",
			elements: [
				clip({ id: "d", startTime: 0, mediaId: "m2" }),
				clip({ id: "e", startTime: 2, mediaId: "m1" }),
			],
			transitions: [
				transition({
					id: "de",
					fromElementId: "d",
					toElementId: "e",
					type: "cube",
					direction: "left",
					presetId: "cube-preset",
				}),
			],
		},
		{
			id: "hidden",
			name: "Hidden",
			type: "media",
			hidden: true,
			elements: [
				clip({ id: "f", startTime: 0, mediaId: "m1" }),
				clip({ id: "g", startTime: 2, mediaId: "m2" }),
			],
			transitions: [
				transition({
					id: "fg",
					fromElementId: "f",
					toElementId: "g",
					type: "dissolve",
				}),
			],
		},
	];

	it("splits seams into canvas, native Jianying, and unsupported", () => {
		const plan = buildExportClipTransitionPlan({
			tracks,
			mediaItems,
			fps: 30,
			...CANVAS,
			canvasFilterSupported: true,
		});
		expect(plan.canvasTransitions.map((item) => item.id)).toEqual(["ab"]);
		expect(plan.jianyingTransitions.map((item) => item.id)).toEqual(["bc"]);
		expect(plan.unsupported).toEqual([
			{
				transition: expect.objectContaining({ id: "de", type: "cube" }),
				reason: "3D perspective transforms",
			},
		]);
		expect(plan.canvasTracks?.map((track) => track.transitions)).toEqual([
			[expect.objectContaining({ id: "ab" })],
			[],
			[],
		]);
		expect(plan.canvasTracks?.[0].elements).toBe(tracks[0].elements);
	});

	it("is inert for transition-free timelines", () => {
		const plan = buildExportClipTransitionPlan({
			tracks: tracks.map((track) => ({ ...track, transitions: [] })),
			mediaItems,
			fps: 30,
			...CANVAS,
		});
		expect(plan).toEqual({
			canvasTracks: null,
			canvasTransitions: [],
			jianyingTransitions: [],
			unsupported: [],
		});
	});

	it("names every unsupported transition when failing closed", () => {
		const plan = buildExportClipTransitionPlan({
			tracks,
			mediaItems,
			fps: 30,
			...CANVAS,
			canvasFilterSupported: true,
		});
		expect(() =>
			assertCanvasClipTransitionsRenderable({ plan, engineLabel: "muxer" })
		).toThrow(
			/muxer export engine cannot render .*"cube-preset" \(cube\) needs 3D perspective transforms/
		);
		expect(() =>
			assertCanvasClipTransitionsRenderable({
				plan: { ...plan, unsupported: [] },
				engineLabel: "muxer",
			})
		).not.toThrow();
	});
});

describe("beginClipTransitionLayer", () => {
	const size = { width: 400, height: 200 };

	function presentation({
		overrides,
		role,
		progress,
	}: {
		overrides: Partial<ClipTransition> & Pick<ClipTransition, "type">;
		role: "from" | "to";
		progress: number;
	}) {
		return getClipTransitionLayerPresentation({
			transition: transition({ id: "t", ...overrides }),
			role,
			progress,
			canvasWidth: size.width,
			canvasHeight: size.height,
		});
	}

	it("draws untouched layers straight onto the export canvas", () => {
		const main = mockContext(size);
		const layer = beginClipTransitionLayer({
			ctx: main,
			...size,
			presentation: presentation({
				overrides: { type: "dissolve" },
				role: "from",
				progress: 0.5,
			}),
			anchor: { x: 0, y: 0 },
			layerContext: mockContext(size),
		});
		expect(layer.active).toBe(false);
		expect(layer.ctx).toBe(main);
	});

	it("fills the backdrop, fades content, and composites about the anchor", () => {
		const main = mockContext(size);
		const group = mockContext(size);
		const layer = beginClipTransitionLayer({
			ctx: main,
			...size,
			presentation: presentation({
				overrides: { type: "fade-black" },
				role: "from",
				progress: 0.25,
			}),
			anchor: { x: 10, y: -4 },
			layerContext: group,
		});
		expect(layer.active).toBe(true);
		expect(layer.ctx).toBe(group);
		expect(group.fillStyle).toBe("#000000");
		expect(group.fillRect).toHaveBeenCalledWith(0, 0, 400, 200);
		expect(group.translate).toHaveBeenCalledWith(-10, 4);
		expect(group.globalAlpha).toBeCloseTo(0.5);

		layer.finish();
		expect(main.translate).toHaveBeenNthCalledWith(1, 210, 96);
		expect(main.rotate).toHaveBeenCalledWith(0);
		expect(main.scale).toHaveBeenCalledWith(1, 1);
		expect(main.translate).toHaveBeenNthCalledWith(2, -200, -100);
		expect(main.drawImageSources).toEqual([group.canvas]);
		expect(main.drawImageAlphas).toEqual([1]);
		expect(main.restore).toHaveBeenCalledOnce();
	});

	it("clips wipes with an inset rectangle in box-local space", () => {
		const main = mockContext(size);
		const layer = beginClipTransitionLayer({
			ctx: main,
			...size,
			presentation: presentation({
				overrides: { type: "wipe", direction: "left" },
				role: "to",
				progress: 0.5,
			}),
			anchor: { x: 0, y: 0 },
			layerContext: mockContext(size),
		});
		layer.finish();
		expect(main.rect).toHaveBeenCalledWith(0, 0, 200, 200);
		expect(main.clip).toHaveBeenCalledOnce();
	});

	it("offsets sliding layers and multiplies element opacity into the group", () => {
		const main = mockContext(size);
		const layer = beginClipTransitionLayer({
			ctx: main,
			...size,
			presentation: presentation({
				overrides: { type: "slide", direction: "left" },
				role: "to",
				progress: 0.25,
			}),
			anchor: { x: 0, y: 0 },
			layerOpacity: 0.5,
			layerContext: mockContext(size),
		});
		layer.finish();
		expect(main.translate).toHaveBeenNthCalledWith(1, 200 - 300, 100);
		expect(main.drawImageAlphas).toEqual([0.5]);
	});

	it("applies transition filters and stacked opacity at composite time", () => {
		const main = mockContext(size);
		const layer = beginClipTransitionLayer({
			ctx: main,
			...size,
			presentation: presentation({
				overrides: { type: "zoom-blur" },
				role: "to",
				progress: 0.5,
			}),
			anchor: { x: 0, y: 0 },
			layerContext: mockContext(size),
		});
		layer.finish();
		expect(main.filter).toMatch(/^blur\(12px\)/);
		expect(main.drawImageAlphas).toEqual([0.5]);
		expect(main.scale).toHaveBeenCalledWith(1.18, 1.18);
	});
});
