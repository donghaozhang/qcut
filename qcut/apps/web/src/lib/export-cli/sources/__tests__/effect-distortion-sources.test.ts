import type { EffectRenderProgram, TimelineTrack } from "@qcut/editor-core";
import { describe, expect, it, vi } from "vitest";
import {
	extractEffectDistortionSources,
	renderDistortionMapPair,
} from "../effect-distortion-sources";

function distortionProgram({
	variant,
}: {
	variant: "fisheye" | "ripple" | "shockwave" | "magnifier";
}): EffectRenderProgram {
	return {
		version: 1,
		stages: [{ kind: "distortion", variant, strength: 1 }],
	};
}

function tracksWithElement({
	elementId,
	duration,
}: {
	elementId: string;
	duration: number;
}): TimelineTrack[] {
	return [
		{
			id: "track-1",
			elements: [{ id: elementId, duration, trimStart: 0, trimEnd: 0 }],
		},
	] as unknown as TimelineTrack[];
}

function createSaveMock() {
	return vi.fn(
		async ({
			sequenceId,
			frameIndex,
			extension,
		}: {
			sessionId: string;
			sequenceId: string;
			frameIndex: number;
			imageData: Uint8Array;
			extension?: string;
		}) => ({
			success: true,
			path: `/tmp/effect-sequences/${sequenceId}/f_${String(frameIndex).padStart(5, "0")}.${extension}`,
			patternPath: `/tmp/effect-sequences/${sequenceId}/f_%05d.${extension}`,
		})
	);
}

describe("renderDistortionMapPair", () => {
	it("writes 16-bit big-endian PGM maps with full-res coordinates", () => {
		const { xmap, ymap } = renderDistortionMapPair({
			stage: { kind: "distortion", variant: "fisheye", strength: 1 },
			timeSeconds: 0,
			mapWidth: 4,
			mapHeight: 2,
			sourceWidth: 1920,
			sourceHeight: 1080,
		});

		const header = "P5\n4 2\n65535\n";
		const decoder = new TextDecoder();
		expect(decoder.decode(xmap.slice(0, header.length))).toBe(header);
		expect(decoder.decode(ymap.slice(0, header.length))).toBe(header);
		expect(xmap.length).toBe(header.length + 4 * 2 * 2);
		expect(ymap.length).toBe(header.length + 4 * 2 * 2);

		// Every stored coordinate must stay within the source bounds.
		for (let i = header.length; i < xmap.length; i += 2) {
			const x = (xmap[i] << 8) | xmap[i + 1];
			const y = (ymap[i] << 8) | ymap[i + 1];
			expect(x).toBeGreaterThanOrEqual(0);
			expect(x).toBeLessThanOrEqual(1919);
			expect(y).toBeGreaterThanOrEqual(0);
			expect(y).toBeLessThanOrEqual(1079);
		}
	});

	it("keeps the untouched region an identity map for the magnifier", () => {
		const width = 64;
		const height = 64;
		const { xmap } = renderDistortionMapPair({
			stage: { kind: "distortion", variant: "magnifier", strength: 1 },
			timeSeconds: 0,
			mapWidth: width,
			mapHeight: height,
			sourceWidth: width,
			sourceHeight: height,
		});
		const headerLength = xmap.length - width * height * 2;
		// Top-left corner is outside the loupe: expect identity sampling.
		const cornerX = (xmap[headerLength] << 8) | xmap[headerLength + 1];
		expect(cornerX).toBe(0);
	});
});

describe("extractEffectDistortionSources", () => {
	it("bakes one map pair for static variants", async () => {
		const saveEffectSequenceFrame = createSaveMock();

		const result = await extractEffectDistortionSources({
			programsByElementId: new Map([
				["clip-a", distortionProgram({ variant: "fisheye" })],
			]),
			tracks: tracksWithElement({ elementId: "clip-a", duration: 30 }),
			sessionId: "session-1",
			canvasWidth: 640,
			canvasHeight: 360,
			fps: 30,
			api: { saveEffectSequenceFrame },
			logger: vi.fn(),
		});

		// One xmap + one ymap, regardless of the element duration.
		expect(saveEffectSequenceFrame).toHaveBeenCalledTimes(2);
		expect(saveEffectSequenceFrame).toHaveBeenCalledWith(
			expect.objectContaining({ sequenceId: "p-clip-a-s0x", extension: "pgm" })
		);
		expect(result.get("clip-a")).toEqual([
			{
				stageIndex: 0,
				xmapPath: "/tmp/effect-sequences/p-clip-a-s0x/f_00000.pgm",
				ymapPath: "/tmp/effect-sequences/p-clip-a-s0y/f_00000.pgm",
				animated: false,
			},
		]);
	});

	it("bakes per-frame map pairs for animated variants", async () => {
		const saveEffectSequenceFrame = createSaveMock();

		const result = await extractEffectDistortionSources({
			programsByElementId: new Map([
				["clip-a", distortionProgram({ variant: "ripple" })],
			]),
			tracks: tracksWithElement({ elementId: "clip-a", duration: 0.5 }),
			sessionId: "session-1",
			canvasWidth: 640,
			canvasHeight: 360,
			fps: 10,
			api: { saveEffectSequenceFrame },
			logger: vi.fn(),
		});

		// 0.5s at 10fps → 5 frames × 2 maps.
		expect(saveEffectSequenceFrame).toHaveBeenCalledTimes(10);
		expect(result.get("clip-a")).toEqual([
			{
				stageIndex: 0,
				xmapPath: "/tmp/effect-sequences/p-clip-a-s0x/f_%05d.pgm",
				ymapPath: "/tmp/effect-sequences/p-clip-a-s0y/f_%05d.pgm",
				animated: true,
				sequence: { framerate: 10 },
			},
		]);
	});

	it("throws when the target element is missing from the timeline", async () => {
		await expect(
			extractEffectDistortionSources({
				programsByElementId: new Map([
					["ghost", distortionProgram({ variant: "fisheye" })],
				]),
				tracks: tracksWithElement({ elementId: "clip-a", duration: 1 }),
				sessionId: "session-1",
				canvasWidth: 640,
				canvasHeight: 360,
				fps: 30,
				api: { saveEffectSequenceFrame: createSaveMock() },
				logger: vi.fn(),
			})
		).rejects.toThrow(/missing from the timeline: ghost/);
	});
});
