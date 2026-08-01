import { Hono, type Context } from "hono";
import { getSupabase } from "../db/supabase";
import { authMiddleware } from "../middleware/auth";
import { isUserIdAllowlisted } from "../services/user-id-allowlist";

const SOUND_EFFECTS_BUCKET = "sound-effects-lab";
const SIGNED_URL_TTL_SECONDS = 600;
const PRIVATE_MANIFEST_OBJECT_KEY = "jianying/2026-08-01/manifest.json";
const PRIVATE_AUDIO_OBJECT_KEY_PATTERN =
	/^jianying\/\d{4}-\d{2}-\d{2}\/assets\/[a-f0-9]{32}\.mp3$/;

function isSoundEffectsLabUserAllowed({
	userId,
}: {
	userId: string | undefined;
}): boolean {
	return isUserIdAllowlisted({
		allowlist: process.env.SOUND_EFFECTS_LAB_ALLOWED_USER_IDS,
		userId,
	});
}

const soundEffectsLabRoutes = new Hono();
soundEffectsLabRoutes.use("/*", authMiddleware);

soundEffectsLabRoutes.get("/assets", async (c) => {
	const userId = c.get("userId") as string | undefined;
	if (!isSoundEffectsLabUserAllowed({ userId })) {
		return c.json({ error: "Forbidden" }, 403);
	}

	const objectKey = c.req.query("objectKey");
	if (!objectKey || !PRIVATE_AUDIO_OBJECT_KEY_PATTERN.test(objectKey)) {
		return c.json({ error: "Invalid sound effect object key" }, 400);
	}

	return signSoundEffectObject({ c, objectKey });
});

soundEffectsLabRoutes.get("/private-manifest", async (c) => {
	const userId = c.get("userId") as string | undefined;
	if (!isSoundEffectsLabUserAllowed({ userId })) {
		return c.json({ error: "Forbidden" }, 403);
	}

	try {
		const { data, error } = await getSupabase()
			.storage.from(SOUND_EFFECTS_BUCKET)
			.download(PRIVATE_MANIFEST_OBJECT_KEY);
		if (error || !data) {
			return c.json(
				{ error: "Private sound effects manifest unavailable" },
				404
			);
		}
		return new Response(await data.arrayBuffer(), {
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			},
		});
	} catch {
		return c.json({ error: "Private sound effects manifest unavailable" }, 502);
	}
});

async function signSoundEffectObject({
	c,
	objectKey,
}: {
	c: Context;
	objectKey: string;
}): Promise<Response> {
	try {
		const { data, error } = await getSupabase()
			.storage.from(SOUND_EFFECTS_BUCKET)
			.createSignedUrl(objectKey, SIGNED_URL_TTL_SECONDS);
		if (error || !data?.signedUrl) {
			return c.json({ error: "Failed to sign sound effect asset" }, 502);
		}

		const response = c.redirect(data.signedUrl, 302);
		response.headers.set("Cache-Control", "no-store");
		return response;
	} catch {
		return c.json({ error: "Failed to sign sound effect asset" }, 502);
	}
}

export { soundEffectsLabRoutes };
