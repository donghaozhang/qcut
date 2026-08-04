import {
	DEFAULT_PRIVATE_STICKER_CATALOG_ID,
	getPrivateStickerCatalogDefinition,
	MAX_PRIVATE_STICKER_MANIFEST_BYTES,
} from "@qcut/editor-core/sticker-lab";
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
	/^jianying\/([a-z0-9]+(?:-[a-z0-9]+)*)\/assets\/[0-9]+\.(gif|png)$/;

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
	const match = PRIVATE_REFERENCE_OBJECT_KEY_PATTERN.exec(objectKey);
	const namespace = match?.[1];
	if (!namespace) {
		return false;
	}
	return (
		getPrivateStickerCatalogDefinition({
			catalogId: `jianying-${namespace}`,
		}) !== null
	);
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
		// thumbnails require the allow list. Skip the transform because the private
		// grid intentionally reuses the cached original for both GIF and PNG assets.
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
	c.header("Cache-Control", "no-store");
	const userId = c.get("userId") as string | undefined;
	if (!isStickerLabUserAllowed({ userId })) {
		return c.json({ error: "Forbidden" }, 403);
	}
	const requestedCatalogId =
		c.req.query("catalogId") ?? DEFAULT_PRIVATE_STICKER_CATALOG_ID;
	const catalog = getPrivateStickerCatalogDefinition({
		catalogId: requestedCatalogId,
	});
	if (!catalog) {
		return c.json({ error: "Invalid private sticker catalog" }, 400);
	}

	try {
		// The third argument is spread straight into the fetch RequestInit, and
		// workerd rejects a `cache` field ("not implemented") at this Worker's
		// compatibility date. The throw surfaces as a download error, which this
		// route reports as a missing manifest, so every catalogue 404s in
		// production while passing under Bun. Freshness is already guaranteed by
		// the no-store response header above.
		const { data, error } = await getSupabase()
			.storage.from(STICKER_BUCKET)
			.download(catalog.manifestObjectKey);
		if (error || !data) {
			return c.json({ error: "Private manifest unavailable" }, 404);
		}
		if (data.size > MAX_PRIVATE_STICKER_MANIFEST_BYTES) {
			return c.json({ error: "Private manifest unavailable" }, 502);
		}

		const manifestBytes = await data.arrayBuffer();
		if (manifestBytes.byteLength > MAX_PRIVATE_STICKER_MANIFEST_BYTES) {
			return c.json({ error: "Private manifest unavailable" }, 502);
		}

		return new Response(manifestBytes, {
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
