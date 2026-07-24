import { describe, expect, it, vi } from "vitest";
import {
	collectDemoPrewarmPanels,
	prewarmEditorDemo,
} from "../native-pipeline/editor/editor-demo-prewarm.js";
import type { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";

function readyState({
	currentTime = 0,
	lastPresentedAt = null,
	activeVideoMediaIds = [],
}: {
	currentTime?: number;
	lastPresentedAt?: number | null;
	activeVideoMediaIds?: string[];
} = {}) {
	return {
		version: 1,
		timestamp: Date.now(),
		state: {
			project: { activeProject: { id: "promo" } },
			timeline: {
				playhead: {
					currentTime,
					isPlaying: false,
					duration: 10,
					speed: 1,
				},
			},
			editor: {
				initialization: {
					isInitializing: false,
					isPanelsReady: true,
				},
				preview: {
					panelMounted: true,
					canvasMounted: true,
					ready: true,
					reason: null,
					loading: false,
					activeVideoMediaIds,
					nativeCompositionStatus: "idle",
					lastPresentedAt,
					videos: [],
				},
			},
		},
	};
}

describe("editor demo prewarm", () => {
	it("collects unique panels from operational and pointer actions", () => {
		expect(
			collectDemoPrewarmPanels({
				actions: [
					{ action: "switch-panel", panel: "media" },
					{ action: "click", target: "panel.effects" },
					{ action: "click", target: "panel.media" },
				],
			})
		).toEqual(["media", "effects"]);
	});

	it("loads panels, restores the opening panel, seeks, and waits for preview", async () => {
		const get = vi.fn(async (url: string) =>
			url === "/api/claude/state" ? readyState() : { elements: [] }
		);
		const post = vi.fn(async () => ({ ok: true }));
		const client = { get, post } as unknown as EditorApiClient;

		const result = await prewarmEditorDemo({
			client,
			projectId: "promo",
			actions: [
				{ action: "click", target: "panel.media" },
				{ action: "click", target: "panel.effects" },
			],
			panelSettleMs: 0,
			timeoutMs: 100,
		});

		expect(result.panels).toEqual(["media", "effects"]);
		expect(post.mock.calls).toEqual(
			expect.arrayContaining([
				["/api/claude/ui/switch-panel", { panel: "media" }],
				["/api/claude/ui/switch-panel", { panel: "effects" }],
				["/api/claude/pointer/hide", {}],
				["/api/claude/timeline/promo/playback", { action: "seek", time: 0 }],
			])
		);
		expect(result.preview.preview.ready).toBe(true);
	});

	it("requires a newly presented video frame when the seek changes time", async () => {
		const requestedAt = Date.now();
		let stateRequestCount = 0;
		const get = vi.fn(async (url: string) => {
			if (url !== "/api/claude/state") return { elements: [] };
			stateRequestCount += 1;
			if (stateRequestCount === 1) {
				return readyState({
					currentTime: 2,
					lastPresentedAt: requestedAt - 100,
					activeVideoMediaIds: ["video-1"],
				});
			}
			return readyState({
				currentTime: 0,
				lastPresentedAt: Date.now() + 100,
				activeVideoMediaIds: ["video-1"],
			});
		});
		const client = {
			get,
			post: vi.fn(async () => ({ ok: true })),
		} as unknown as EditorApiClient;

		const result = await prewarmEditorDemo({
			client,
			projectId: "promo",
			actions: [],
			panelSettleMs: 0,
			timeoutMs: 100,
		});

		expect(stateRequestCount).toBeGreaterThanOrEqual(2);
		expect(result.preview.preview.lastPresentedAt).toBeGreaterThan(requestedAt);
	});
});
