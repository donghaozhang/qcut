import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { handleEditorCommand } from "../native-pipeline/cli/cli-handlers-editor.js";
import {
	mockRoute,
	clearRoutes,
	installFetchMock,
	makeOpts,
	noopProgress,
	originalFetch,
	BASE_URL,
	lastCapturedBody,
	lastCapturedMethod,
} from "./editor-cli-test-setup";

/** Mock health + capabilities so the handler doesn't reject early. */
function mockHealthy() {
	mockRoute("GET", "/api/claude/health", {
		success: true,
		data: { status: "ok" },
	});
	mockRoute("GET", "/api/claude/capabilities", {
		success: true,
		data: { capabilities: {} },
	});
}

/** Wrap data in the standard API envelope. */
function envelope(data: unknown) {
	return { success: true, data };
}

describe("editor:ui:context-menu CLI command", () => {
	beforeAll(() => {
		installFetchMock(BASE_URL);
	});

	afterEach(() => {
		clearRoutes();
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns error when --element-id is missing", async () => {
		mockHealthy();
		const result = await handleEditorCommand(
			makeOpts({ command: "editor:ui:context-menu" }),
			noopProgress
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--element-id");
	});

	it("dispatches POST to /api/claude/ui/context-menu with elementId", async () => {
		mockHealthy();
		mockRoute(
			"POST",
			"/api/claude/ui/context-menu",
			envelope({ found: true, menuOpen: true, x: 500, y: 300 })
		);
		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:ui:context-menu",
				elementId: "test-element-123",
			}),
			noopProgress
		);
		expect(result.success).toBe(true);
		expect(lastCapturedMethod).toBe("POST");
		const body = JSON.parse(lastCapturedBody ?? "{}");
		expect(body.elementId).toBe("test-element-123");
	});

	it("sends debug flag when verbose is true", async () => {
		mockHealthy();
		mockRoute(
			"POST",
			"/api/claude/ui/context-menu",
			envelope({ found: true, menuOpen: true, events: [] })
		);
		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:ui:context-menu",
				elementId: "test-element-123",
				verbose: true,
			}),
			noopProgress
		);
		expect(result.success).toBe(true);
		const body = JSON.parse(lastCapturedBody ?? "{}");
		expect(body.debug).toBe(true);
	});

	it("returns data from server response", async () => {
		mockHealthy();
		const responseData = { found: true, menuOpen: true, x: 100, y: 200 };
		mockRoute(
			"POST",
			"/api/claude/ui/context-menu",
			envelope(responseData)
		);
		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:ui:context-menu",
				elementId: "elem-abc",
			}),
			noopProgress
		);
		expect(result.success).toBe(true);
		expect(result.data).toEqual(responseData);
	});

	it("reports element not found from server", async () => {
		mockHealthy();
		mockRoute(
			"POST",
			"/api/claude/ui/context-menu",
			envelope({ found: false, error: "Element not found" })
		);
		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:ui:context-menu",
				elementId: "nonexistent",
			}),
			noopProgress
		);
		expect(result.success).toBe(true);
		expect((result.data as { found: boolean }).found).toBe(false);
	});
});
