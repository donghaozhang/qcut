import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store";
import type { HyperframesElement, TimelineTrack } from "@/types/timeline";
import {
	createHyperframesExportController,
	fitHyperframesRenderDimensions,
	prepareHyperframesForExport,
	type HyperframesExportController,
} from "../export-preprocessor";

function hyperframesElement({
	id,
	sourcePath = "/project/index.html",
	title = "Hello",
	hidden,
}: {
	id: string;
	sourcePath?: string;
	title?: string;
	hidden?: boolean;
}): HyperframesElement {
	return {
		id,
		type: "hyperframes",
		name: `Composition ${id}`,
		duration: 4,
		startTime: 1,
		trimStart: 0.5,
		trimEnd: 0.25,
		hidden,
		compositionId: "main",
		sourcePath,
		projectPath: "/project",
		compositionWidth: 1920,
		compositionHeight: 1080,
		fps: 30,
		variableValues: { title },
		variableDefinitions: [
			{
				id: "title",
				type: "string",
				label: "Title",
				default: "Hello",
			},
		],
		renderMode: "live",
		opacity: 0.8,
		scale: 1.25,
	};
}

function track(elements: HyperframesElement[]): TimelineTrack {
	return {
		id: "hf-track",
		name: "HyperFrames",
		type: "hyperframes",
		elements,
	};
}

function mockController({ duration }: { duration?: number } = {}): {
	controller: HyperframesExportController;
	render: ReturnType<typeof vi.fn>;
	cleanup: ReturnType<typeof vi.fn>;
} {
	const render = vi.fn(async (job) => ({
		job,
		outputPath: `/tmp/${job.renderId}.mov`,
		outputUrl: `qcut-hyperframes://session-${job.renderId}/composition.webm`,
		sessionId: `session-${job.renderId}`,
		mediaId: `media-${job.renderId}`,
		duration: duration ?? job.element.duration,
	}));
	const cleanup = vi.fn(async () => undefined);
	return {
		render,
		cleanup,
		controller: {
			render,
			cancel: vi.fn(async () => undefined),
			cleanup,
			onProgress: vi.fn(() => () => undefined),
			isCancelled: vi.fn(() => false),
		},
	};
}

describe("HyperFrames export preprocessing", () => {
	it("deduplicates identical renders and maps elements to ephemeral media", async () => {
		const first = hyperframesElement({ id: "first" });
		const second = {
			...hyperframesElement({ id: "second" }),
			startTime: 8,
		};
		const mocked = mockController();

		const result = await prepareHyperframesForExport({
			tracks: [track([first, second])],
			mediaItems: [],
			frameRate: 30,
			resolution: { width: 1920, height: 1080 },
			controller: mocked.controller,
			createId: () => "job",
		});

		expect(mocked.render).toHaveBeenCalledTimes(1);
		expect(result.renderedElementCount).toBe(2);
		expect(result.mediaItems).toHaveLength(1);
		expect(result.mediaItems[0]).toMatchObject({
			id: "media-hyperframes-job",
			type: "video",
			url: "qcut-hyperframes://session-hyperframes-job/composition.webm",
			localPath: "/tmp/hyperframes-job.mov",
			ephemeral: true,
		});
		expect(result.tracks[0]).toMatchObject({ type: "media" });
		const elements = result.tracks[0].elements;
		expect(elements).toHaveLength(2);
		expect(elements[0]).toMatchObject({
			type: "media",
			mediaId: "media-hyperframes-job",
			trimStart: 0.5,
			trimEnd: 0.25,
			opacity: 0.8,
			scaleX: 1.25,
			scaleY: 1.25,
		});
		expect(elements[1]).toMatchObject({
			type: "media",
			mediaId: "media-hyperframes-job",
			startTime: 8,
		});
	});

	it("uses runtime duration for media and clamps stale trims", async () => {
		const element = {
			...hyperframesElement({ id: "runtime-duration" }),
			trimStart: 3,
			trimEnd: 2,
		};
		const mocked = mockController({ duration: 4 });

		const result = await prepareHyperframesForExport({
			tracks: [track([element])],
			mediaItems: [],
			frameRate: 30,
			resolution: { width: 1920, height: 1080 },
			controller: mocked.controller,
			createId: () => "runtime",
		});

		expect(result.mediaItems[0].duration).toBe(4);
		expect(result.tracks[0].elements[0]).toMatchObject({
			duration: 4,
			trimStart: 3,
			trimEnd: 1,
		});
	});

	it("does not render hidden elements", async () => {
		const visible = hyperframesElement({ id: "visible" });
		const hidden = hyperframesElement({ id: "hidden", hidden: true });
		const mocked = mockController();

		const result = await prepareHyperframesForExport({
			tracks: [track([visible, hidden])],
			mediaItems: [] satisfies MediaItem[],
			frameRate: 24,
			resolution: { width: 1280, height: 720 },
			controller: mocked.controller,
			createId: () => "visible",
		});

		expect(mocked.render).toHaveBeenCalledTimes(1);
		expect(result.tracks[0].elements).toHaveLength(1);
		expect(result.tracks[0].elements[0].id).toBe("visible");
	});

	it("preserves aspect ratio while capping render dimensions", () => {
		expect(
			fitHyperframesRenderDimensions({
				sourceWidth: 3840,
				sourceHeight: 2160,
				maxWidth: 1920,
				maxHeight: 1080,
			})
		).toEqual({ width: 1920, height: 1080 });
		expect(
			fitHyperframesRenderDimensions({
				sourceWidth: 1080,
				sourceHeight: 1920,
				maxWidth: 1920,
				maxHeight: 1080,
			})
		).toEqual({ width: 608, height: 1080 });
		expect(
			fitHyperframesRenderDimensions({
				sourceWidth: Number.NaN,
				sourceHeight: Number.POSITIVE_INFINITY,
				maxWidth: Number.NaN,
				maxHeight: Number.POSITIVE_INFINITY,
			})
		).toEqual({ width: 2, height: 2 });
	});

	it("cancels active renders before cleaning output sessions", async () => {
		let resolveRender:
			| ((value: {
					success: boolean;
					renderId: string;
					outputPath: string;
					outputUrl: string;
					sessionId: string;
			  }) => void)
			| undefined;
		const render = vi.fn(
			() =>
				new Promise<{
					success: boolean;
					renderId: string;
					outputPath: string;
					outputUrl: string;
					sessionId: string;
				}>((resolve) => {
					resolveRender = resolve;
				})
		);
		const cancel = vi.fn(async () => ({ success: true }));
		const cleanup = vi.fn(async () => ({ success: true }));
		const controller = createHyperframesExportController({
			api: {
				select: vi.fn(),
				registerPreview: vi.fn(),
				releasePreview: vi.fn(),
				render,
				cancel,
				cleanup,
				onRenderProgress: vi.fn(() => () => undefined),
			},
			createId: () => "media",
		});
		const job = {
			key: "job",
			renderId: "render-active",
			element: hyperframesElement({ id: "active" }),
			width: 1280,
			height: 720,
			fps: 30,
		};
		const pending = controller.render(job);

		await controller.cleanup();
		expect(cancel).toHaveBeenCalledWith("render-active");

		resolveRender?.({
			success: true,
			renderId: "render-active",
			outputPath: "/tmp/render.mov",
			outputUrl: "qcut-hyperframes://session-render/composition.webm",
			sessionId: "session-render",
		});
		await expect(pending).rejects.toThrow("cancelled");
		expect(cleanup).toHaveBeenCalledWith("session-render");
	});
});
