import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import {
	deleteUserKey,
	listUserKeys,
	upsertUserKeys,
} from "../services/user-keys-service";

const KEY_NAME_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;
const MAX_KEYS_PER_REQUEST = 40;
const MAX_VALUE_LENGTH = 512;

/** The session token must never round-trip through the vault. */
const RESERVED_KEY_NAMES = new Set(["QCUT_AUTH_TOKEN"]);

function maskValue(value: string): string {
	if (value.length <= 8) return "****";
	return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function isStorableKeyName(name: string): boolean {
	return KEY_NAME_PATTERN.test(name) && !RESERVED_KEY_NAMES.has(name);
}

const keysRoutes = new Hono();
keysRoutes.use("/*", authMiddleware);

keysRoutes.get("/", async (c) => {
	try {
		const keys = await listUserKeys({ userId: c.get("userId") as string });
		return c.json({
			keys: keys.map((k) => ({
				key: k.key,
				masked: maskValue(k.value),
				updatedAt: k.updatedAt,
			})),
		});
	} catch (error) {
		return c.json(
			{ error: error instanceof Error ? error.message : "Failed to list keys" },
			500
		);
	}
});

keysRoutes.get("/values", async (c) => {
	try {
		const keys = await listUserKeys({ userId: c.get("userId") as string });
		const values: Record<string, string> = {};
		for (const k of keys) {
			values[k.key] = k.value;
		}
		return c.json({ keys: values });
	} catch (error) {
		return c.json(
			{ error: error instanceof Error ? error.message : "Failed to load keys" },
			500
		);
	}
});

keysRoutes.put("/", async (c) => {
	try {
		const body = (await c.req.json()) as Record<string, unknown>;
		const keys = body.keys;
		if (!keys || typeof keys !== "object" || Array.isArray(keys)) {
			return c.json({ error: "Body must be { keys: { NAME: value } }" }, 400);
		}
		const entries = Object.entries(keys as Record<string, unknown>);
		if (entries.length === 0) {
			return c.json({ error: "No keys provided" }, 400);
		}
		if (entries.length > MAX_KEYS_PER_REQUEST) {
			return c.json(
				{ error: `At most ${MAX_KEYS_PER_REQUEST} keys per request` },
				400
			);
		}
		const validated: Record<string, string> = {};
		for (const [name, value] of entries) {
			if (!isStorableKeyName(name)) {
				return c.json({ error: `Invalid key name '${name}'` }, 400);
			}
			if (
				typeof value !== "string" ||
				value.length === 0 ||
				value.length > MAX_VALUE_LENGTH
			) {
				return c.json({ error: `Invalid value for '${name}'` }, 400);
			}
			validated[name] = value;
		}
		const result = await upsertUserKeys({
			userId: c.get("userId") as string,
			keys: validated,
		});
		return c.json({ saved: result.saved });
	} catch (error) {
		return c.json(
			{ error: error instanceof Error ? error.message : "Failed to save keys" },
			500
		);
	}
});

keysRoutes.delete("/:name", async (c) => {
	try {
		const name = c.req.param("name");
		if (!isStorableKeyName(name)) {
			return c.json({ error: `Invalid key name '${name}'` }, 400);
		}
		const result = await deleteUserKey({
			userId: c.get("userId") as string,
			key: name,
		});
		return c.json({ deleted: result.deleted });
	} catch (error) {
		return c.json(
			{
				error: error instanceof Error ? error.message : "Failed to delete key",
			},
			500
		);
	}
});

export { keysRoutes };
