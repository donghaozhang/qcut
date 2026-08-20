import { beforeEach, describe, expect, it, vi } from "vitest";
import { addClaudeStickerElement } from "../claude-timeline-bridge-helpers";

const overlayMocks = vi.hoisted(() => ({
	addOverlaySticker: vi.fn(),
	getStickersForExport: vi.fn(() => []),
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: { getState: vi.fn(() => ({})) },
}));
vi.mock("@/stores/project-store", () => ({
	useProjectStore: { getState: vi.fn(() => ({ activeProject: null })) },
}));
vi.mock("@/stores/media/media-store", () => ({
	useMediaStore: { getState: vi.fn(() => ({ mediaItems: [] })) },
}));
vi.mock("@qcut/platform-core", () => ({
	platform: vi.fn(() => ({ projectFolder: undefined })),
}));
vi.mock("@/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugWarn: vi.fn(),
	debugError: vi.fn(),
}));
vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: {
		getState: vi.fn(() => ({
			addOverlaySticker: overlayMocks.addOverlaySticker,
			getStickersForExport: overlayMocks.getStickersForExport,
		})),
	},
}));

function makeTimelineStore() {
	return {
		findOrCreateTrack: vi.fn(() => "sticker-track"),
		addElementToTrack: vi.fn(),
	};
}

describe("Claude sticker geometry", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("stores the timeline element in the canonical percentage contract", async () => {
		const timelineStore = makeTimelineStore();
		// Top-left pixel geometry on a 1920x1080 canvas: a 384x384 sticker at
		// (768,348). Center = (960,540) = canvas center → 50%,50%. Size is a
		// percentage of the shorter side (1080): 384/1080 = 35.5…%.
		await addClaudeStickerElement({
			element: {
				stickerId: "s1",
				mediaId: "m1",
				x: 768,
				y: 348,
				width: 384,
				height: 384,
			},
			timelineStore: timelineStore as never,
		});

		expect(timelineStore.addElementToTrack).toHaveBeenCalledOnce();
		const [, stored] = timelineStore.addElementToTrack.mock.calls[0];
		expect(stored.type).toBe("sticker");
		expect(stored.x).toBeCloseTo(50, 5);
		expect(stored.y).toBeCloseTo(50, 5);
		expect(stored.width).toBeCloseTo((384 / 1080) * 100, 5);
		expect(stored.height).toBeCloseTo((384 / 1080) * 100, 5);

		// The overlay store must receive the same percentages, so preview and
		// export agree with the timeline element.
		expect(overlayMocks.addOverlaySticker).toHaveBeenCalledWith(
			"m1",
			expect.objectContaining({
				position: {
					x: expect.closeTo(50, 5),
					y: expect.closeTo(50, 5),
				},
				size: {
					width: expect.closeTo((384 / 1080) * 100, 5),
					height: expect.closeTo((384 / 1080) * 100, 5),
				},
			})
		);
	});
});
