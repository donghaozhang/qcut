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

function createSnapshotWindow({
	result,
}: {
	result: unknown;
}): {
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
	});

	it("maps renderer action failures to rejected promises", async () => {
		const { window } = createSnapshotWindow({
			result: {
				ok: false,
				errorCode: "not_found",
				message: "No element found for snapshot ref @e9.",
			},
		});

		await expect(clickEditorSnapshotRef(window, { ref: "@e9" })).rejects.toThrow(
			"No element found for snapshot ref @e9."
		);
	});
});
