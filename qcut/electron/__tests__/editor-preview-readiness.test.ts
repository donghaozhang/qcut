import { describe, expect, it, vi } from "vitest";
import { ensureEditorPreviewReady } from "../native-pipeline/editor/editor-preview-readiness.js";
import type { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";
import type { EditorStateSnapshot } from "../types/claude-api.js";

function snapshot({
	ready,
	reason = null,
	lastPresentedAt = 100,
}: {
	ready: boolean;
	reason?: string | null;
	lastPresentedAt?: number | null;
}): EditorStateSnapshot {
	return {
		version: 1,
		timestamp: 100,
		state: {
			project: {
				activeProject: {
					id: "promo",
					name: "Promo",
					currentSceneId: "scene-1",
					sceneCount: 1,
					sceneIds: ["scene-1"],
					thumbnail: "",
					createdAt: null,
					updatedAt: null,
					canvasSize: { width: 1920, height: 1080 },
					canvasMode: "preset",
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
					ready,
					reason,
					loading: false,
					activeVideoMediaIds: ["video-1"],
					nativeCompositionStatus: "idle",
					lastPresentedAt,
					videos: [],
				},
			},
		},
	};
}

describe("editor preview readiness", () => {
	it("waits until the renderer reports a presented video frame", async () => {
		const get = vi
			.fn()
			.mockResolvedValueOnce(
				snapshot({
					ready: false,
					reason: "active-video-frame-not-ready:video-1",
				})
			)
			.mockResolvedValueOnce(snapshot({ ready: true, lastPresentedAt: 250 }));
		const client = { get } as unknown as EditorApiClient;

		const result = await ensureEditorPreviewReady({
			client,
			projectId: "promo",
			afterTimestamp: 200,
			timeoutMs: 200,
			intervalMs: 1,
		});

		expect(result.preview.ready).toBe(true);
		expect(get).toHaveBeenCalledWith("/api/claude/state", {
			include: "timeline,playhead,media,editor,project",
		});
	});

	it("rejects a previously rendered frame after a seek boundary", async () => {
		const client = {
			get: vi.fn(async () => snapshot({ ready: true, lastPresentedAt: 100 })),
		} as unknown as EditorApiClient;

		await expect(
			ensureEditorPreviewReady({
				client,
				projectId: "promo",
				afterTimestamp: 200,
				timeoutMs: 20,
				intervalMs: 20,
			})
		).rejects.toThrow("preview-frame-predates-request");
	});
});
