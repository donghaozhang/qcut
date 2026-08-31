import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type {
	ClipTransition,
	MediaElement,
	TimelineTrack,
} from "@/types/timeline";
import { renderFrame, type RenderContext } from "../export-engine-renderer";
import { buildExportRenderIndex } from "../export-render-index";
import type { SequentialVideoRegistry } from "../export-sequential-video-source";

interface DrawRecord {
	alpha: number;
	source: unknown;
}

interface RecordingContext extends CanvasRenderingContext2D {
	draws: DrawRecord[];
}

function createContext({
	canvas,
}: {
	canvas: { width: number; height: number };
}): RecordingContext {
	const ctx = {
		canvas,
		draws: [] as DrawRecord[],
		globalAlpha: 1,
		filter: "none",
		fillStyle: "",
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
		ctx.draws.push({ alpha: ctx.globalAlpha, source });
	});
	return ctx as unknown as RecordingContext;
}

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

function videoItem({ id }: { id: string }): MediaItem {
	return {
		id,
		name: `${id}.mp4`,
		type: "video",
		file: new File(["x"], `${id}.mp4`, { type: "video/mp4" }),
		url: `blob:${id}`,
	};
}

interface FrameRequest {
	lane: string | undefined;
	mediaId: string;
	time: number;
}

function createSequentialRegistry({
	requests,
}: {
	requests: FrameRequest[];
}): SequentialVideoRegistry {
	return {
		getOrOpen: vi.fn(async (mediaItem: MediaItem, lane?: string) => ({
			frameAt: async (time: number) => {
				requests.push({ lane, mediaId: mediaItem.id, time });
				return {
					canvas: { width: 64, height: 36, mediaId: mediaItem.id },
					timestamp: time,
					duration: 1 / 30,
				};
			},
		})),
		disposeAll: vi.fn(async () => {}),
	} as unknown as SequentialVideoRegistry;
}

describe("export renderer clip transitions", () => {
	const canvas = { width: 320, height: 180 } as HTMLCanvasElement;
	const mediaItems = [videoItem({ id: "m1" }), videoItem({ id: "m2" })];
	const dissolve: ClipTransition = {
		id: "ab",
		fromElementId: "a",
		toElementId: "b",
		presetId: "dissolve",
		type: "dissolve",
		duration: 1,
		easing: "linear",
	};
	const tracks: TimelineTrack[] = [
		{
			id: "main",
			name: "Media",
			type: "media",
			elements: [
				clip({ id: "a", startTime: 0, mediaId: "m1" }),
				clip({ id: "b", startTime: 2, mediaId: "m2" }),
			],
			transitions: [dissolve],
		},
	];
	let groupContexts: RecordingContext[];

	beforeEach(() => {
		groupContexts = [];
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
			function (this: HTMLCanvasElement) {
				const ctx = createContext({ canvas: this });
				groupContexts.push(ctx);
				return ctx as unknown as CanvasRenderingContext2D;
			} as unknown as typeof HTMLCanvasElement.prototype.getContext
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function createRenderContext({
		requests,
		withTransitions = true,
	}: {
		requests: FrameRequest[];
		withTransitions?: boolean;
	}): { context: RenderContext; ctx: RecordingContext } {
		const ctx = createContext({ canvas });
		const context: RenderContext = {
			ctx,
			canvas,
			tracks,
			mediaItems,
			videoCache: new Map(),
			usedImages: new Set(),
			fps: 30,
			renderIndex: withTransitions
				? buildExportRenderIndex({
						tracks,
						mediaItems,
						fps: 30,
						canvasWidth: canvas.width,
						canvasHeight: canvas.height,
					})
				: undefined,
			sequentialVideo: createSequentialRegistry({ requests }),
		};
		return { context, ctx };
	}

	it("draws both clips inside the window with the presentation's alpha", async () => {
		const requests: FrameRequest[] = [];
		const { context, ctx } = createRenderContext({ requests });

		await renderFrame(context, 1.75);

		expect(requests).toEqual([
			{ lane: "a", mediaId: "m1", time: expect.closeTo(1.75 + 1 / 60) },
			{
				lane: "b",
				mediaId: "m2",
				time: expect.closeTo(1 / 60),
			},
		]);
		// Outgoing clip draws straight onto the canvas; the incoming clip is
		// composited from the group layer at the dissolve's 25% opacity.
		expect(ctx.draws).toEqual([
			{ alpha: 1, source: expect.objectContaining({ mediaId: "m1" }) },
			{ alpha: expect.closeTo(0.25), source: expect.any(HTMLCanvasElement) },
		]);
		const group = groupContexts.find((candidate) => candidate.draws.length > 0);
		expect(group?.draws).toEqual([
			{ alpha: 1, source: expect.objectContaining({ mediaId: "m2" }) },
		]);
	});

	it("holds the outgoing clip's last frame after the cut", async () => {
		const requests: FrameRequest[] = [];
		const { context, ctx } = createRenderContext({ requests });

		await renderFrame(context, 2.25);

		expect(requests).toEqual([
			{ lane: "a", mediaId: "m1", time: 2 },
			{
				lane: "b",
				mediaId: "m2",
				time: expect.closeTo(0.25 + 1 / 60),
			},
		]);
		expect(ctx.draws.map((draw) => draw.alpha)).toEqual([
			1,
			expect.closeTo(0.75),
		]);
	});

	it("leaves frames outside the window on the single-clip path", async () => {
		const requests: FrameRequest[] = [];
		const { context, ctx } = createRenderContext({ requests });

		await renderFrame(context, 1);
		await renderFrame(context, 2.5);

		expect(requests).toEqual([
			{ lane: "a", mediaId: "m1", time: expect.closeTo(1 + 1 / 60) },
			{ lane: "b", mediaId: "m2", time: expect.closeTo(0.5 + 1 / 60) },
		]);
		expect(ctx.draws.map((draw) => draw.alpha)).toEqual([1, 1]);
		expect(groupContexts.every((group) => group.draws.length === 0)).toBe(true);
	});

	it("keeps the hard cut when no render index carries a transition plan", async () => {
		const requests: FrameRequest[] = [];
		const { context, ctx } = createRenderContext({
			requests,
			withTransitions: false,
		});

		await renderFrame(context, 1.75);

		expect(requests).toEqual([
			{ lane: "a", mediaId: "m1", time: expect.closeTo(1.75 + 1 / 60) },
		]);
		expect(ctx.draws).toHaveLength(1);
	});
});
