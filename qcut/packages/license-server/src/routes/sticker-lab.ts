import { Hono } from "hono";
import { getSupabase } from "../db/supabase";
import { authMiddleware } from "../middleware/auth";

const STICKER_BUCKET = "sticker-lab";
const SIGNED_URL_TTL_SECONDS = 600;
const STICKER_OBJECT_KEY_PATTERN =
	/^jianying\/[a-z0-9-]+\/assets\/[a-z0-9-]+\.(gif|png)$/;

function isStickerLabUserAllowed({
	userId,
}: {
	userId: string | undefined;
}): boolean {
	if (!userId) {
		return false;
	}

	const allowedUserIds = (process.env.STICKER_LAB_ALLOWED_USER_IDS ?? "")
		.split(",")
		.map((allowedUserId) => allowedUserId.trim())
		.filter((allowedUserId) => allowedUserId.length > 0);
	return allowedUserIds.includes(userId);
}

const stickerLabRoutes = new Hono();
stickerLabRoutes.use("/*", authMiddleware);

stickerLabRoutes.get("/assets", async (c) => {
	const userId = c.get("userId") as string | undefined;
	if (!isStickerLabUserAllowed({ userId })) {
		return c.json({ error: "Forbidden" }, 403);
	}

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
