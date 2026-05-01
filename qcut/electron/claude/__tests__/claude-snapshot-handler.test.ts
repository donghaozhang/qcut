import { describe, expect, it, vi } from "vitest";
import {
	clickEditorSnapshotRef,
	fillEditorSnapshotRef,
	requestEditorSnapshotFromRenderer,
} from "../handlers/claude-snapshot-handler.js";
import type {
	EditorSnapshotActionResult,
	EditorSnapshotResult,
} from "../../types/claude-api.js";

function createSnapshotWindow({ result }: { result: unknown }): {
	window: Electron.BrowserWindow;
	executeJavaScript: ReturnType<typeof vi.fn>;
} {
	const executeJavaScript = vi.fn(async () => result);
	return {
		window: {
			webContents: {
				executeJavaScript,
			},
		} as unknown as Electron.BrowserWindow,
		executeJavaScript,
	};
}

describe("claude-snapshot-handler", () => {
	it("requests a renderer snapshot with normalized options", async () => {
		const snapshot: EditorSnapshotResult = {
			version: 1,
			timestamp: 123,
			interactiveOnly: true,
			maxDepth: 2,
			elements: [
				{
					ref: "@e1",
					parentRef: null,
					depth: 0,
					actionable: true,
					role: "button",
					tagName: "button",
					name: "Export",
					textPreview: "Export",
					testId: "export-button",
					placeholder: null,
					value: null,
					disabled: false,
					checked: null,
					selected: null,
					expanded: null,
					bounds: { x: 10, y: 20, width: 80, height: 32 },
				},
			],
			summary: {
				total: 1,
				actionable: 1,
			},
		};
		const { window, executeJavaScript } = createSnapshotWindow({
			result: snapshot,
		});

		const result = await requestEditorSnapshotFromRenderer(window, {
			interactive: true,
			depth: 2,
		});

		expect(result).toEqual(snapshot);
		expect(executeJavaScript).toHaveBeenCalledTimes(1);
		const [script] = executeJavaScript.mock.calls[0] ?? [];
		expect(script).toContain("const interactiveOnly = true;");
		expect(script).toContain("const maxDepth = 2;");
		expect(script).toContain(
			'const SNAPSHOT_STATE_KEY = "__qcutSnapshotState";'
		);
		expect(script).toContain("const assignStableRef = (element, usedRefs) =>");
	});

	it("rejects invalid renderer payloads", async () => {
		const { window } = createSnapshotWindow({
			result: { ok: true },
		});

		await expect(requestEditorSnapshotFromRenderer(window)).rejects.toThrow(
			"invalid accessibility snapshot"
		);
	});

	it("clicks a snapshot ref through the renderer", async () => {
		const actionResult: EditorSnapshotActionResult = {
			action: "click",
			ref: "@e1",
			tagName: "button",
			role: "button",
			name: "Export",
			value: null,
		};
		const { window, executeJavaScript } = createSnapshotWindow({
			result: actionResult,
		});

		const result = await clickEditorSnapshotRef(window, { ref: "@e1" });

		expect(result).toEqual(actionResult);
		const [script] = executeJavaScript.mock.calls[0] ?? [];
		expect(script).toContain('const targetRef = "@e1";');
		expect(script).toContain("element.click()");
		expect(script).toContain("const stableKey = state.keyByRef[targetRef];");
		expect(script).toContain(
			"const findElementByStableKey = (stableKey, targetRef) =>"
		);
	});

	it("fills a snapshot ref through the renderer", async () => {
		const actionResult: EditorSnapshotActionResult = {
			action: "fill",
			ref: "@e2",
			tagName: "input",
			role: "textbox",
			name: "Project name",
			value: "Updated title",
		};
		const { window, executeJavaScript } = createSnapshotWindow({
			result: actionResult,
		});

		const result = await fillEditorSnapshotRef(window, {
			ref: "@e2",
			value: "Updated title",
		});

		expect(result).toEqual(actionResult);
		const [script] = executeJavaScript.mock.calls[0] ?? [];
		expect(script).toContain('const targetRef = "@e2";');
		expect(script).toContain('const nextValue = "Updated title";');
		expect(script).toContain("const stableKey = state.keyByRef[targetRef];");
	});

	it("maps renderer action failures to rejected promises", async () => {
		const { window } = createSnapshotWindow({
			result: {
				ok: false,
				errorCode: "not_found",
				message: "No element found for snapshot ref @e9.",
			},
		});

		await expect(
			clickEditorSnapshotRef(window, { ref: "@e9" })
		).rejects.toThrow("No element found for snapshot ref @e9.");
	});

	// Truncation guard tests — pin the contract for the bug-fix landed in
	// docs/task/editor-cli-results-2026-04-30/IMPLEMENTATION-PLAN.md
	describe("truncation envelope", () => {
		it("forwards maxBytes and maxNodes into the renderer script", async () => {
			const { window, executeJavaScript } = createSnapshotWindow({
				result: {
					version: 1,
					timestamp: 0,
					interactiveOnly: false,
					maxDepth: 8,
					elements: [],
					summary: { total: 0, actionable: 0 },
					truncated: false,
				},
			});

			await requestEditorSnapshotFromRenderer(window, {
				maxBytes: 4096,
				maxNodes: 12,
			});

			const [script] = executeJavaScript.mock.calls[0] ?? [];
			expect(script).toContain("const MAX_BYTES = 4096;");
			expect(script).toContain("const MAX_NODES = 12;");
		});

		it("uses defaults (256 KB / 500 nodes) when caller doesn't specify", async () => {
			const { window, executeJavaScript } = createSnapshotWindow({
				result: {
					version: 1,
					timestamp: 0,
					interactiveOnly: false,
					maxDepth: 8,
					elements: [],
					summary: { total: 0, actionable: 0 },
					truncated: false,
				},
			});

			await requestEditorSnapshotFromRenderer(window);

			const [script] = executeJavaScript.mock.calls[0] ?? [];
			// 256 * 1024 = 262144
			expect(script).toContain("const MAX_BYTES = 262144;");
			expect(script).toContain("const MAX_NODES = 500;");
		});

		it("accepts a truncated envelope from the renderer without throwing", async () => {
			const truncated = {
				truncated: true,
				reason:
					"Snapshot exceeds maxBytes (4096). Got 12345 bytes across 3 elements.",
				suggestion:
					"Re-run with --interactive (actionable elements only), --depth N to limit DOM traversal, --max-nodes N for an explicit element cap, or --max-bytes N to lift the byte cap.",
				meta: {
					totalNodes: 3,
					serializedBytes: 12345,
					maxBytes: 4096,
					maxNodes: 500,
				},
			};
			const { window } = createSnapshotWindow({ result: truncated });

			const result = await requestEditorSnapshotFromRenderer(window, {
				maxBytes: 4096,
			});

			expect(result).toEqual(truncated);
			expect((result as { truncated?: boolean }).truncated).toBe(true);
		});

		it("rejects malformed truncation payloads", async () => {
			// Looks-like-truncated but missing required fields
			const { window } = createSnapshotWindow({
				result: { truncated: true, reason: "incomplete" },
			});

			await expect(requestEditorSnapshotFromRenderer(window)).rejects.toThrow(
				"invalid accessibility snapshot"
			);
		});
	});
});
