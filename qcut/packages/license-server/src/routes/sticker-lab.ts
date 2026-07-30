import { Hono } from "hono";
import { getSupabase } from "../db/supabase";
import { authMiddleware } from "../middleware/auth";

const STICKER_BUCKET = "sticker-lab";
const SIGNED_URL_TTL_SECONDS = 600;
const STICKER_OBJECT_KEY_PATTERN =
	/^jianying\/[a-z0-9-]+\/assets\/[a-z0-9-]+\.(gif|png)$/;

const stickerLabRoutes = new Hono();
stickerLabRoutes.use("/*", authMiddleware);

stickerLabRoutes.get("/assets", async (c) => {
	const objectKey = c.req.query("objectKey");
	if (!objectKey || !STICKER_OBJECT_KEY_PATTERN.test(objectKey)) {
		return c.json({ error: "Invalid sticker object key" }, 400);
	}

	try {
		const { data, error } = await getSupabase()
			.storage.from(STICKER_BUCKET)
			.createSignedUrl(objectKey, SIGNED_URL_TTL_SECONDS);

		if (error || !data?.signedUrl) {
			return c.json({ error: "Failed to sign sticker asset" }, 502);
		}

		const response = c.redirect(data.signedUrl, 302);
		response.headers.set("Cache-Control", "no-store");
		return response;
	} catch {
		return c.json({ error: "Failed to sign sticker asset" }, 502);
	}
});

export { stickerLabRoutes };
