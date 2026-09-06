import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createHash } from "node:crypto";
import {
	validateComposeSnapshot,
	hasComposeValidationErrors,
} from "@qcut/editor-core/compose";
import { authMiddleware } from "../middleware/auth";
import { composeJobStore, type ComposeCloudInput } from "../compose/job-store";

export function createComposeRoutes({
	store = composeJobStore,
}: {
	store?: typeof composeJobStore;
} = {}) {
	const routes = new Hono();
	routes.use("*", authMiddleware);
	routes.use("*", bodyLimit({ maxSize: 2 * 1024 * 1024 }));
	routes.post("/jobs", async (c) => {
		if (process.env.QCUT_COMPOSE_ENABLED !== "true")
			return c.json({ error: "compose_not_configured" }, 503);
		let input: ComposeCloudInput;
		let id: string;
		try {
			const body = await c.req.json();
			id = body.id;
			if (
				typeof id !== "string" ||
				!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,179}$/.test(id)
			)
				throw new Error("id");
			input = { snapshot: body.snapshot, intent: body.intent };
			if (
				input.snapshot?.schemaVersion !== 1 ||
				typeof input.snapshot.id !== "string" ||
				!input.snapshot.id ||
				typeof input.snapshot.sourceFingerprint !== "string" ||
				!input.snapshot.sourceFingerprint
			)
				throw new Error("snapshot-identity");
			if (
				!input.intent ||
				input.intent.schemaVersion !== 1 ||
				![
					"smart-packaging",
					"subtitle-style",
					"resource-match",
					"full-compose",
				].includes(input.intent.kind)
			)
				throw new Error("intent");
			if (
				!input.intent.options ||
				typeof input.intent.options !== "object" ||
				Array.isArray(input.intent.options)
			)
				throw new Error("intent-options");
			if (
				hasComposeValidationErrors({
					issues: validateComposeSnapshot({ snapshot: input.snapshot }),
				})
			)
				throw new Error("snapshot");
			if (
				input.snapshot.availableResources.length > 1000 ||
				input.snapshot.media.length > 500 ||
				input.snapshot.captions.length > 5000
			)
				throw new Error("size");
			// The cloud accepts public resource identities, never package bytes or local locators.
			if (
				input.snapshot.availableResources.some(
					(asset) => asset.localPath || asset.cacheKey || asset.provenance
				)
			)
				throw new Error("private-resource-data");
		} catch {
			return c.json({ error: "invalid_compose_input" }, 400);
		}
		try {
			const row = await store.create({
				id,
				userId: c.get("userId") as string,
				input,
				inputHash: createHash("sha256")
					.update(JSON.stringify(input))
					.digest("hex"),
			});
			return c.json({ id: row.id, status: row.status }, 202);
		} catch (error) {
			const code = error instanceof Error ? error.message : "";
			if (code === "compose_idempotency_conflict")
				return c.json({ error: code }, 409);
			if (code === "compose_quota_exceeded")
				return c.json({ error: code }, 429);
			return c.json({ error: "compose_storage_unavailable" }, 503);
		}
	});
	routes.get("/jobs/:id", async (c) => {
		const row = await store.get({
			id: c.req.param("id"),
			userId: c.get("userId") as string,
		});
		return row
			? c.json({
					id: row.id,
					status: row.status,
					attempt: row.attempt,
					errorCode: row.error_code,
				})
			: c.json({ error: "compose_job_not_found" }, 404);
	});
	routes.get("/jobs/:id/result", async (c) => {
		const row = await store.get({
			id: c.req.param("id"),
			userId: c.get("userId") as string,
		});
		if (!row) return c.json({ error: "compose_job_not_found" }, 404);
		if (row.status !== "completed")
			return c.json({ error: "compose_job_not_completed" }, 409);
		return c.json(row.result);
	});
	routes.post("/jobs/:id/cancel", async (c) => {
		const row = await store.cancel({
			id: c.req.param("id"),
			userId: c.get("userId") as string,
		});
		return row
			? c.json({ id: row.id, status: row.status })
			: c.json({ error: "compose_job_not_found" }, 404);
	});
	return routes;
}

export const composeRoutes = createComposeRoutes();
