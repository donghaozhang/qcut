import { Hono, type Context } from "hono";
import { getSupabase } from "../db/supabase";
import { authMiddleware } from "../middleware/auth";

const STICKER_BUCKET = "sticker-lab";
const SIGNED_URL_TTL_SECONDS = 600;
/**
 * Preview tier. Every signed-in user may browse the lab at this size; only
 * allow-listed users can sign the full-resolution original that is usable on
 * a timeline. Transformation happens in Supabase, so no second copy of the
 * catalogue has to be stored or kept in sync.
 */
const STICKER_THUMBNAIL_EDGE_PIXELS = 192;
const STICKER_THUMBNAIL_QUALITY = 60;
const STICKER_OBJECT_KEY_PATTERN =
	/^catalogs\/qcut-original(?:-[a-z0-9]+)+\/assets\/[a-z0-9]+(?:-[a-z0-9]+)*\.(gif|png)$/;

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

	return signStickerObject({ c, objectKey });
});

stickerLabRoutes.get("/thumbnail", async (c) => {
	// Deliberately no allow-list check: previews are what makes the lab
	// browsable for everyone. The transform is applied server-side, so the
	// signed URL cannot be edited into a full-resolution download.
	const objectKey = c.req.query("objectKey");
	if (!objectKey || !STICKER_OBJECT_KEY_PATTERN.test(objectKey)) {
		return c.json({ error: "Invalid sticker object key" }, 400);
	}

	return signStickerObject({
		c,
		objectKey,
		transform: {
			width: STICKER_THUMBNAIL_EDGE_PIXELS,
			height: STICKER_THUMBNAIL_EDGE_PIXELS,
			quality: STICKER_THUMBNAIL_QUALITY,
			resize: "contain",
		},
	});
});

async function signStickerObject({
	c,
	objectKey,
	transform,
}: {
	c: Context;
	objectKey: string;
	transform?: {
		width: number;
		height: number;
		quality: number;
		resize: "contain";
	};
}): Promise<Response> {
	try {
		// Only forward options when a transform is requested, so signing the
		// original keeps its original two-argument call.
		const { data, error } = await getSupabase()
			.storage.from(STICKER_BUCKET)
			.createSignedUrl(
				objectKey,
				SIGNED_URL_TTL_SECONDS,
				...(transform ? [{ transform }] : [])
			);

		if (error || !data?.signedUrl) {
			return c.json({ error: "Failed to sign sticker asset" }, 502);
		}

		const response = c.redirect(data.signedUrl, 302);
		response.headers.set("Cache-Control", "no-store");
		return response;
	} catch {
		return c.json({ error: "Failed to sign sticker asset" }, 502);
	}
}

export { stickerLabRoutes };
