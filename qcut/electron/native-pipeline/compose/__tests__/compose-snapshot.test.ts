import { describe, expect, it, vi } from "vitest";
import type { EditorApiClient } from "../../editor/editor-api-client";
import { captureComposeSnapshot } from "../compose-snapshot";

describe("compose snapshot", () => {
	it("captures media from the live editor timeline shape", async () => {
		const get = vi.fn(async (path: string) => {
			if (path.endsWith("/settings")) {
				return {
					fps: 30,
					canvasSize: { width: 1920, height: 1080 },
				};
			}
			return {
				tracks: [
					{
						id: "main-track",
						type: "media",
						elements: [
							{
								id: "element-main",
								type: "media",
								sourceId: "media-dance",
								startTime: 0,
								duration: 10,
								trimStart: 0,
								trimEnd: 0,
							},
						],
					},
					{
						id: "overlay-track",
						type: "media",
						elements: [
							{
								id: "element-overlay",
								type: "media",
								sourceId: "media-dance",
								startTime: 0,
								duration: 5,
								trimStart: 0,
								trimEnd: 0,
							},
						],
					},
					{
						id: "caption-track",
						type: "captions",
						elements: [
							{
								id: "caption-1",
								type: "captions",
								content: "Grace in motion",
								language: "en",
								startTime: 1,
								duration: 2,
							},
						],
					},
				],
			};
		});
		const client = { get } as unknown as EditorApiClient;

		const snapshot = await captureComposeSnapshot({
			client,
			projectId: "project-e2e",
			snapshotId: "snapshot-e2e",
			createdAt: "2026-08-30T00:00:00.000Z",
			discoverResources: vi.fn().mockResolvedValue({
				resources: [],
				warnings: [],
				capabilities: {
					resourceBroker: true,
					jianyingLocalTransitions: false,
				},
			}),
			analyzeMedia: vi.fn().mockResolvedValue({
				beats: [{ id: "beat", timestamp: 2 }],
				shots: [
					{ id: "shot", startTime: 0, duration: 5, label: "A wide stage" },
				],
				warnings: [],
			}),
		});

		expect(snapshot.project.duration).toBe(10);
		expect(snapshot.beats).toEqual([{ id: "beat", timestamp: 2 }]);
		expect(snapshot.shots[0]).toMatchObject({ label: "A wide stage" });
		expect(snapshot.media).toEqual([
			{
				id: "media-dance",
				kind: "video",
				trackId: "main-track",
				elementId: "element-main",
				startTime: 0,
				duration: 10,
				trimStart: 0,
			},
			{
				id: "media-dance",
				kind: "video",
				trackId: "overlay-track",
				elementId: "element-overlay",
				startTime: 0,
				duration: 5,
				trimStart: 0,
			},
		]);
		expect(snapshot.captions).toEqual([
			{
				id: "caption-1",
				text: "Grace in motion",
				language: "en",
				startTime: 1,
				duration: 2,
			},
		]);
	});
});
