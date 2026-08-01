import { Hono, type Context } from "hono";
import { getSupabase } from "../db/supabase";
import { authMiddleware } from "../middleware/auth";
import { isUserIdAllowlisted } from "../services/user-id-allowlist";

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
/**
 * Harvested third-party reference catalogue. Unlike the public catalogue,
 * every tier of it — manifest, previews, originals — is restricted to the
 * allow list; it must never be browsable by ordinary signed-in users.
 */
const PRIVATE_REFERENCE_OBJECT_KEY_PATTERN =
	/^jianying\/[0-9]{4}-[0-9]{2}-[0-9]{2}\/assets\/[0-9]+\.(gif|png)$/;
const PRIVATE_REFERENCE_MANIFEST_OBJECT_KEY =
	"jianying/2026-07-31/manifest.json";

function isStickerLabUserAllowed({
	userId,
}: {
	userId: string | undefined;
}): boolean {
	return isUserIdAllowlisted({
		allowlist: process.env.STICKER_LAB_ALLOWED_USER_IDS,
		userId,
	});
}

const stickerLabRoutes = new Hono();
stickerLabRoutes.use("/*", authMiddleware);

function isPrivateReferenceObjectKey({
	objectKey,
}: {
	objectKey: string;
}): boolean {
	return PRIVATE_REFERENCE_OBJECT_KEY_PATTERN.test(objectKey);
}

stickerLabRoutes.get("/assets", async (c) => {
	const userId = c.get("userId") as string | undefined;
	if (!isStickerLabUserAllowed({ userId })) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const objectKey = c.req.query("objectKey");
	if (
		!objectKey ||
		(!STICKER_OBJECT_KEY_PATTERN.test(objectKey) &&
			!isPrivateReferenceObjectKey({ objectKey }))
	) {
		return c.json({ error: "Invalid sticker object key" }, 400);
	}

	return signStickerObject({ c, objectKey });
});

stickerLabRoutes.get("/thumbnail", async (c) => {
	const objectKey = c.req.query("objectKey");
	if (objectKey && isPrivateReferenceObjectKey({ objectKey })) {
		// The harvested reference catalogue has no public preview tier: even
		// thumbnails require the allow list. Skip the transform — these are
		// animated GIFs and the viewer is entitled to the original anyway.
		const userId = c.get("userId") as string | undefined;
		if (!isStickerLabUserAllowed({ userId })) {
			return c.json({ error: "Forbidden" }, 403);
		}
		return signStickerObject({ c, objectKey });
	}

	// Deliberately no allow-list check: previews are what makes the lab
	// browsable for everyone. The transform is applied server-side, so the
	// signed URL cannot be edited into a full-resolution download.
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

stickerLabRoutes.get("/private-manifest", async (c) => {
	const userId = c.get("userId") as string | undefined;
	if (!isStickerLabUserAllowed({ userId })) {
		return c.json({ error: "Forbidden" }, 403);
	}

	try {
		const { data, error } = await getSupabase()
			.storage.from(STICKER_BUCKET)
			.download(PRIVATE_REFERENCE_MANIFEST_OBJECT_KEY);
		if (error || !data) {
			return c.json({ error: "Private manifest unavailable" }, 404);
		}
		return new Response(await data.arrayBuffer(), {
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			},
		});
	} catch {
		return c.json({ error: "Private manifest unavailable" }, 502);
	}
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
