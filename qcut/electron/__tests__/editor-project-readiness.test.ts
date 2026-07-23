import { describe, expect, it, vi } from "vitest";
import { ensureEditorProjectReady } from "../native-pipeline/editor/editor-project-readiness.js";
import type { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";

describe("editor project readiness", () => {
	it("always navigates when open is requested, then waits for editor services", async () => {
		const get = vi.fn(async (url: string) => {
			if (url === "/api/claude/navigator/projects") {
				return { activeProjectId: "promo" };
			}
			if (url === "/api/claude/media/promo") return [];
			if (url === "/api/claude/timeline/promo") return { tracks: [] };
			throw new Error(`Unexpected GET ${url}`);
		});
		const post = vi.fn(async () => ({
			navigated: true,
			projectId: "promo",
		}));
		const client = { get, post } as unknown as EditorApiClient;

		const result = await ensureEditorProjectReady({
			client,
			projectId: "promo",
			timeoutMs: 200,
			intervalMs: 1,
		});

		expect(result.opened).toBe(true);
		expect(post).toHaveBeenCalledWith("/api/claude/navigator/open", {
			projectId: "promo",
		});
		expect(get).toHaveBeenCalledWith("/api/claude/media/promo");
		expect(get).toHaveBeenCalledWith("/api/claude/timeline/promo");
	});

	it("does not navigate when the caller only checks an active project", async () => {
		const get = vi.fn(async (url: string) => {
			if (url === "/api/claude/navigator/projects") {
				return { activeProjectId: "promo" };
			}
			if (url === "/api/claude/media/promo") return [];
			if (url === "/api/claude/timeline/promo") return { tracks: [] };
			throw new Error(`Unexpected GET ${url}`);
		});
		const post = vi.fn();
		const client = { get, post } as unknown as EditorApiClient;

		const result = await ensureEditorProjectReady({
			client,
			projectId: "promo",
			open: false,
			timeoutMs: 200,
			intervalMs: 1,
		});

		expect(result.opened).toBe(false);
		expect(post).not.toHaveBeenCalled();
	});
});
