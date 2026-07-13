import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import {
	listUserLibraryDocuments,
	putUserLibraryDocument,
} from "../services/user-library-service";

const MAX_LIBRARY_PAYLOAD_BYTES = 512 * 1_024;
const LIBRARY_NAMESPACES = new Set([
	"audio-presets",
	"clip-presets",
	"color-presets",
	"text-presets",
	"timeline-templates",
]);
const DOCUMENT_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;

function isSupportedNamespace({ value }: { value: unknown }): value is string {
	return typeof value === "string" && LIBRARY_NAMESPACES.has(value);
}

function serializedBytes({ value }: { value: unknown }): number {
	try {
		return new TextEncoder().encode(JSON.stringify(value)).byteLength;
	} catch {
		return Number.POSITIVE_INFINITY;
	}
}

const userLibraryRoutes = new Hono();
userLibraryRoutes.use("/*", authMiddleware);

userLibraryRoutes.get("/", async (c) => {
	try {
		const namespace = c.req.query("namespace");
		if (
			namespace !== undefined &&
			!isSupportedNamespace({ value: namespace })
		) {
			return c.json({ error: "Unsupported library namespace" }, 400);
		}
		const documents = await listUserLibraryDocuments({
			userId: c.get("userId") as string,
			namespace,
		});
		return c.json({ documents });
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to load user library",
			},
			500
		);
	}
});

userLibraryRoutes.post("/documents", async (c) => {
	try {
		const body = (await c.req.json()) as Record<string, unknown>;
		if (!isSupportedNamespace({ value: body.namespace })) {
			return c.json({ error: "Unsupported library namespace" }, 400);
		}
		if (
			typeof body.documentKey !== "string" ||
			!DOCUMENT_KEY_PATTERN.test(body.documentKey)
		) {
			return c.json({ error: "Invalid document key" }, 400);
		}
		if (
			typeof body.baseVersion !== "number" ||
			!Number.isInteger(body.baseVersion) ||
			body.baseVersion < 0
		) {
			return c.json(
				{ error: "baseVersion must be a non-negative integer" },
				400
			);
		}
		if (serializedBytes({ value: body.payload }) > MAX_LIBRARY_PAYLOAD_BYTES) {
			return c.json({ error: "Library document is too large" }, 413);
		}
		const result = await putUserLibraryDocument({
			userId: c.get("userId") as string,
			namespace: body.namespace,
			documentKey: body.documentKey,
			payload: body.payload,
			baseVersion: body.baseVersion,
		});
		if (result.status === "conflict") {
			return c.json({ conflict: true, current: result.current }, 409);
		}
		return c.json({ document: result.document });
	} catch (error) {
		return c.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Failed to save user library document",
			},
			500
		);
	}
});

export { userLibraryRoutes };
