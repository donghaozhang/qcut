import { beforeEach, describe, expect, it, vi } from "vitest";
import { RESTRICTED_MEDIA_EXPORT_MESSAGE } from "../../../../../../electron/types/restricted-media-export-policy";
import { exportStillFrame } from "../export-still-frame";

const mocks = vi.hoisted(() => ({
	renderFrame: vi.fn(async () => {}),
	saveExportedFile: vi.fn(async () => ({
		success: true,
		filePath: "/tmp/out.png",
	})),
	project: {
		id: "p1",
		name: "My: Project?",
		fps: 30,
		canvasSize: { width: 1920, height: 1080 },
		backgroundColor: "#123456",
		backgroundType: "color",
	} as Record<string, unknown> | null,
	mediaItems: [] as Array<Record<string, unknown>>,
	overlayStickers: [] as Array<{ mediaItemId: string }>,
	tracks: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/export/export-engine-renderer", () => ({
	renderFrame: mocks.renderFrame,
}));
vi.mock("@/lib/export/export-output", () => ({
	saveExportedFile: mocks.saveExportedFile,
}));
vi.mock("@/lib/timeline/compound-media", () => ({
	expandCompoundMediaTracks: ({ tracks }: { tracks: unknown[] }) => tracks,
}));
vi.mock("@/stores/project-store", () => ({
	useProjectStore: { getState: () => ({ activeProject: mocks.project }) },
}));
vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: { getState: () => ({ tracks: mocks.tracks }) },
}));
vi.mock("@/stores/media-store", () => ({
	useMediaStore: { getState: () => ({ mediaItems: mocks.mediaItems }) },
}));
vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: {
		getState: () => ({ getStickersForExport: () => mocks.overlayStickers }),
	},
}));
vi.mock("@/stores/editor/playback-store", () => ({
	usePlaybackStore: { getState: () => ({ currentTime: 2.5 }) },
}));

describe("exportStillFrame", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.project = {
			id: "p1",
			name: "My: Project?",
			fps: 30,
			canvasSize: { width: 1920, height: 1080 },
			backgroundColor: "#123456",
			backgroundType: "color",
		};
		mocks.mediaItems = [];
		mocks.overlayStickers = [];
		mocks.tracks = [];
		HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
			callback(new Blob(["png"], { type: "image/png" }));
		};
		HTMLCanvasElement.prototype.getContext = vi.fn(
			() => ({}) as unknown as CanvasRenderingContext2D
		) as unknown as typeof HTMLCanvasElement.prototype.getContext;
	});

	it("renders at project resolution and saves a sanitized PNG name", async () => {
		const result = await exportStillFrame();
		expect(result).toEqual({
			ok: true,
			fileName: "My_ Project_-frame-75.png",
			filePath: "/tmp/out.png",
		});

		const [context, time] = mocks.renderFrame.mock.calls[0] as unknown as [
			{
				canvas: HTMLCanvasElement;
				backgroundColor?: string;
			},
			number,
		];
		expect(context.canvas.width).toBe(1920);
		expect(context.canvas.height).toBe(1080);
		expect(context.backgroundColor).toBe("#123456");
		expect(time).toBe(2.5);
		expect(mocks.saveExportedFile).toHaveBeenCalledWith(
			expect.any(Blob),
			"My_ Project_-frame-75.png"
		);
	});

	it("fails cleanly without an active project", async () => {
		mocks.project = null;
		const result = await exportStillFrame();
		expect(result).toEqual({ ok: false, error: "No active project" });
		expect(mocks.renderFrame).not.toHaveBeenCalled();
	});

	it("propagates renderer failures as errors", async () => {
		mocks.renderFrame.mockRejectedValueOnce(new Error("boom"));
		const result = await exportStillFrame();
		expect(result).toEqual({ ok: false, error: "boom" });
		expect(mocks.saveExportedFile).not.toHaveBeenCalled();
	});

	it("refuses a restricted Sticker Lab frame before rendering", async () => {
		mocks.mediaItems = [
			{
				id: "restricted-sticker",
				metadata: { redistribution: "prohibited" },
			},
		];
		mocks.tracks = [
			{
				elements: [{ mediaId: "restricted-sticker", type: "sticker" }],
				id: "stickers",
				type: "sticker",
			},
		];

		const result = await exportStillFrame();

		expect(result).toMatchObject({
			ok: false,
			error: expect.stringContaining(RESTRICTED_MEDIA_EXPORT_MESSAGE),
		});
		expect(mocks.renderFrame).not.toHaveBeenCalled();
		expect(mocks.saveExportedFile).not.toHaveBeenCalled();
	});

	it("refuses a restricted compound child before rendering", async () => {
		mocks.mediaItems = [
			{
				id: "restricted-compound-child",
				metadata: { redistribution: "prohibited" },
			},
		];
		mocks.tracks = [
			{
				elements: [
					{
						compound: {
							clips: [
								{
									element: {
										mediaId: "restricted-compound-child",
										type: "media",
									},
								},
							],
							kind: "compound",
						},
						mediaId: "public-container",
						type: "media",
					},
				],
				id: "media",
				type: "media",
			},
		];

		const result = await exportStillFrame();

		expect(result).toMatchObject({
			ok: false,
			error: expect.stringContaining("QCUT_RESTRICTED_MEDIA_EXPORT"),
		});
		expect(mocks.renderFrame).not.toHaveBeenCalled();
		expect(mocks.saveExportedFile).not.toHaveBeenCalled();
	});

	it("refuses a restricted overlay-only sticker before rendering", async () => {
		mocks.mediaItems = [
			{
				id: "restricted-overlay-media",
				metadata: { redistribution: "prohibited" },
			},
		];
		mocks.overlayStickers = [{ mediaItemId: "restricted-overlay-media" }];

		const result = await exportStillFrame();

		expect(result).toMatchObject({
			ok: false,
			error: expect.stringContaining("QCUT_RESTRICTED_MEDIA_EXPORT"),
		});
		expect(mocks.renderFrame).not.toHaveBeenCalled();
		expect(mocks.saveExportedFile).not.toHaveBeenCalled();
	});
});
