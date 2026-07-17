import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import {
	incrementAudioTrackDownloads,
	listAudioTrackDownloads,
} from "../services/audio-metrics-service";

const TRACK_KEY_PATTERN = /^(music|sound-effect):-?\d{1,12}$/;

const audioMetricsRoutes = new Hono();
audioMetricsRoutes.use("/*", authMiddleware);

audioMetricsRoutes.post("/downloads", async (c) => {
	try {
		const body = (await c.req.json()) as Record<string, unknown>;
		if (
			typeof body.trackKey !== "string" ||
			!TRACK_KEY_PATTERN.test(body.trackKey)
		) {
			return c.json({ error: "Invalid track key" }, 400);
		}
		const downloads = await incrementAudioTrackDownloads({
			trackKey: body.trackKey,
		});
		return c.json({ downloads });
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to record audio download",
			},
			500
		);
	}
});

audioMetricsRoutes.get("/downloads", async (c) => {
	try {
		const downloads = await listAudioTrackDownloads();
		return c.json({ downloads });
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to load audio downloads",
			},
			500
		);
	}
});

export { audioMetricsRoutes };
