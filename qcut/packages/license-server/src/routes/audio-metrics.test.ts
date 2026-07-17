import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../services/audio-metrics-service", () => ({
	incrementAudioTrackDownloads: vi.fn(),
	listAudioTrackDownloads: vi.fn(),
}));

const metricsService = await import("../services/audio-metrics-service");
const { audioMetricsRoutes } = await import("./audio-metrics");

function buildApp() {
	const app = new Hono();
	app.route("/api/audio-metrics", audioMetricsRoutes);
	return app;
}

function postDownload({ body }: { body: unknown }) {
	return buildApp().request("/api/audio-metrics/downloads", {
		method: "POST",
		headers: {
			Authorization: "Bearer test-token",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
}

beforeEach(() => {
	process.env.MOCK_MODE = "true";
	vi.clearAllMocks();
});

describe("audio metrics routes", () => {
	it("increments a catalog track download counter", async () => {
		vi.mocked(metricsService.incrementAudioTrackDownloads).mockResolvedValue(
			42
		);

		const response = await postDownload({
			body: { trackKey: "music:-1002" },
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ downloads: 42 });
		expect(metricsService.incrementAudioTrackDownloads).toHaveBeenCalledWith({
			trackKey: "music:-1002",
		});
	});

	it("rejects malformed JSON bodies as client errors", async () => {
		const response = await buildApp().request("/api/audio-metrics/downloads", {
			method: "POST",
			headers: {
				Authorization: "Bearer test-token",
				"Content-Type": "application/json",
			},
			body: "{not json",
		});
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "Invalid JSON body",
		});
	});

	it("rejects malformed track keys and non-object bodies", async () => {
		const responses = await Promise.all([
			...["music:abc", "voice:-1", "music:-1; DROP TABLE", 42, undefined].map(
				(trackKey) => postDownload({ body: { trackKey } })
			),
			postDownload({ body: null }),
			postDownload({ body: [1, 2] }),
		]);
		for (const response of responses) {
			expect(response.status).toBe(400);
		}
		expect(metricsService.incrementAudioTrackDownloads).not.toHaveBeenCalled();
	});

	it("lists all counters for manifest backfill", async () => {
		vi.mocked(metricsService.listAudioTrackDownloads).mockResolvedValue({
			"music:-1002": 42,
			"sound-effect:-2001": 7,
		});

		const response = await buildApp().request("/api/audio-metrics/downloads", {
			headers: { Authorization: "Bearer test-token" },
		});

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			downloads: { "music:-1002": 42, "sound-effect:-2001": 7 },
		});
	});

	it("reports service failures as 500", async () => {
		vi.mocked(metricsService.incrementAudioTrackDownloads).mockRejectedValue(
			new Error("database offline")
		);

		const response = await postDownload({
			body: { trackKey: "music:-1002" },
		});

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: "database offline",
		});
	});
});
