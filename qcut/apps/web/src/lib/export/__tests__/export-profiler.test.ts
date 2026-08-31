import { afterEach, describe, expect, it, vi } from "vitest";
import { buildExportRenderIndex } from "../export-render-index";
import { exportProfiler } from "../export-profiler";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TimelineTrack } from "@/types/timeline";

describe("buildExportRenderIndex", () => {
	it("collects sticker ids and media lookups once", () => {
		const tracks = [
			{
				id: "t1",
				type: "sticker",
				elements: [
					{ type: "sticker", stickerId: "s1" },
					{ type: "sticker", stickerId: "s2" },
				],
			},
			{
				id: "t2",
				type: "media",
				elements: [{ type: "media", mediaId: "m1" }],
			},
		] as unknown as TimelineTrack[];
		const mediaItems = [{ id: "m1" }, { id: "m2" }] as MediaItem[];
		const index = buildExportRenderIndex({
			tracks,
			mediaItems,
			fps: 30,
			canvasWidth: 1280,
			canvasHeight: 720,
		});
		expect([...index.timelineStickerIds].sort()).toEqual(["s1", "s2"]);
		expect(index.mediaItemsById.get("m2")).toBe(mediaItems[1]);
		expect(index.mediaItemsById.size).toBe(2);
	});
});

describe("exportProfiler", () => {
	afterEach(() => {
		exportProfiler.disarm();
		vi.unstubAllGlobals();
	});

	it("is a pass-through no-op while disarmed", async () => {
		expect(exportProfiler.isEnabled).toBe(false);
		const value = await exportProfiler.time("stage", async () => 42);
		expect(value).toBe(42);
		expect(exportProfiler.timeSync("stage", () => "sync")).toBe("sync");
		exportProfiler.count("things");
		exportProfiler.frameStart(0);
		exportProfiler.frameEnd();
		// Building a report while disarmed shows nothing was recorded.
		const report = exportProfiler.buildReport({});
		expect(report.stages).toEqual({});
		expect(report.frameCount).toBe(0);
	});

	it("collects stage stats, counters, and slowest frames while armed", async () => {
		exportProfiler.arm({ targetPath: "/tmp/profile.json" });
		for (let frame = 0; frame < 3; frame++) {
			exportProfiler.frameStart(frame);
			await exportProfiler.time("render", async () => undefined);
			exportProfiler.timeSync("index", () => undefined);
			exportProfiler.count("cache-hit");
			exportProfiler.frameEnd();
		}
		const report = exportProfiler.buildReport({ engine: "test" });
		expect(report.stages.render.count).toBe(3);
		expect(report.stages.index.count).toBe(3);
		expect(report.counters["cache-hit"]).toBe(3);
		expect(report.frameCount).toBe(3);
		expect(report.slowestFrames.length).toBe(3);
		expect(report.meta).toEqual({ engine: "test" });
	});

	it("writes the report through the file bridge and disarms", async () => {
		const writeFile = vi.fn(async () => true);
		vi.stubGlobal("window", {
			electronAPI: { writeFile },
		} as unknown as Window);
		exportProfiler.arm({ targetPath: "/tmp/out/profile.json" });
		exportProfiler.record("stage", 5);
		await exportProfiler.finishAndSave({ engine: "muxer" });
		expect(writeFile).toHaveBeenCalledTimes(1);
		const [path, body] = writeFile.mock.calls[0] as unknown as [string, string];
		expect(path).toBe("/tmp/out/profile.json");
		const parsed = JSON.parse(body);
		expect(parsed.kind).toBe("qcut-export-profile-v1");
		expect(parsed.stages.stage.count).toBe(1);
		expect(exportProfiler.isEnabled).toBe(false);
	});

	it("never throws when the file bridge is missing or fails", async () => {
		vi.stubGlobal("window", {} as unknown as Window);
		exportProfiler.arm({ targetPath: "/tmp/profile.json" });
		await expect(
			exportProfiler.finishAndSave({ engine: "muxer" })
		).resolves.toBeUndefined();
		expect(exportProfiler.isEnabled).toBe(false);
	});
});
