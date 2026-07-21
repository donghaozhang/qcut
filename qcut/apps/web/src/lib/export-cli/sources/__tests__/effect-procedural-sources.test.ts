import type { EffectRenderProgram, TimelineTrack } from "@qcut/editor-core";
import { describe, expect, it, vi } from "vitest";
import {
	extractEffectProceduralSources,
	type CreateProceduralFrameCanvas,
} from "../effect-procedural-sources";

function particleProgram(): EffectRenderProgram {
	return {
		version: 1,
		stages: [
			{
				kind: "particles",
				variant: "snow",
				density: 0.5,
				speed: 1,
				color: "#ffffff",
				opacity: 1,
			},
		],
	};
}

function gridProgram(): EffectRenderProgram {
	return {
		version: 1,
		stages: [
			{
				kind: "decoration",
				variant: "grid",
				color: "#ffffff",
				opacity: 0.6,
			},
		],
	};
}

function tracksWithElement({
	elementId,
	duration,
	trimStart = 0,
	trimEnd = 0,
}: {
	elementId: string;
	duration: number;
	trimStart?: number;
	trimEnd?: number;
}): TimelineTrack[] {
	return [
		{
			id: "track-1",
			elements: [{ id: elementId, duration, trimStart, trimEnd }],
		},
	] as unknown as TimelineTrack[];
}

function createStubCanvas(): CreateProceduralFrameCanvas {
	const gradient = { addColorStop: () => {} };
	const context = new Proxy(
		{},
		{
			get: (_target, prop) => {
				if (
					prop === "createRadialGradient" ||
					prop === "createLinearGradient"
				) {
					return () => gradient;
				}
				return () => {};
			},
			set: () => true,
		}
	) as unknown as OffscreenCanvasRenderingContext2D;
	return ({ width, height }) => ({
		width,
		height,
		getContext: () => context,
		convertToBlob: async () =>
			new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
	});
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

describe("extractEffectProceduralSources", () => {
	it("bakes animated stages to one PNG per output frame", async () => {
		const saveEffectSequenceFrame = createSaveMock();
		const progress: number[] = [];

		const result = await extractEffectProceduralSources({
			programsByElementId: new Map([["clip-a", particleProgram()]]),
			tracks: tracksWithElement({
				elementId: "clip-a",
				duration: 1,
				trimEnd: 0.5,
			}),
			sessionId: "session-1",
			canvasWidth: 640,
			canvasHeight: 360,
			fps: 10,
			api: { saveEffectSequenceFrame },
			createCanvas: createStubCanvas(),
			logger: vi.fn(),
			onProgress: ({ bakedFrames }) => progress.push(bakedFrames),
		});

		// 0.5s visible at 10fps → 5 frames.
		expect(saveEffectSequenceFrame).toHaveBeenCalledTimes(5);
		expect(saveEffectSequenceFrame).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				sessionId: "session-1",
				sequenceId: "p-clip-a-s0",
				frameIndex: 0,
			})
		);
		expect(progress).toEqual([1, 2, 3, 4, 5]);
		expect(result.get("clip-a")).toEqual([
			{
				resourceId: "procedural:particles:snow",
				stageIndex: 0,
				path: "/tmp/effect-sequences/p-clip-a-s0/f_%05d.png",
				animated: true,
				sequence: { framerate: 10 },
			},
		]);
	});

	it("bakes static decorations to a single looped frame", async () => {
		const saveEffectSequenceFrame = createSaveMock();

		const result = await extractEffectProceduralSources({
			programsByElementId: new Map([["clip-b", gridProgram()]]),
			tracks: tracksWithElement({ elementId: "clip-b", duration: 30 }),
			sessionId: "session-1",
			canvasWidth: 640,
			canvasHeight: 360,
			fps: 30,
			api: { saveEffectSequenceFrame },
			createCanvas: createStubCanvas(),
			logger: vi.fn(),
		});

		expect(saveEffectSequenceFrame).toHaveBeenCalledTimes(1);
		expect(result.get("clip-b")).toEqual([
			{
				resourceId: "procedural:decoration:grid",
				stageIndex: 0,
				path: "/tmp/effect-sequences/p-clip-b-s0/f_00000.png",
				animated: false,
			},
		]);
	});

	it("throws when the target element is missing from the timeline", async () => {
		await expect(
			extractEffectProceduralSources({
				programsByElementId: new Map([["ghost", particleProgram()]]),
				tracks: tracksWithElement({ elementId: "clip-a", duration: 1 }),
				sessionId: "session-1",
				canvasWidth: 640,
				canvasHeight: 360,
				fps: 30,
				api: { saveEffectSequenceFrame: createSaveMock() },
				createCanvas: createStubCanvas(),
				logger: vi.fn(),
			})
		).rejects.toThrow(/missing from the timeline: ghost/);
	});

	it("surfaces frame save failures with the sequence id", async () => {
		const saveEffectSequenceFrame = vi.fn(async () => ({
			success: false,
			error: "disk full",
		}));

		await expect(
			extractEffectProceduralSources({
				programsByElementId: new Map([["clip-a", particleProgram()]]),
				tracks: tracksWithElement({ elementId: "clip-a", duration: 1 }),
				sessionId: "session-1",
				canvasWidth: 640,
				canvasHeight: 360,
				fps: 30,
				api: { saveEffectSequenceFrame },
				createCanvas: createStubCanvas(),
				logger: vi.fn(),
			})
		).rejects.toThrow("disk full");
	});
});
