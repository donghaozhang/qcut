import { describe, expect, it, vi } from "vitest";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";
import {
	handleKeyboardCommand,
	handlePointerCommand,
	waitForEditorUi,
} from "../native-pipeline/cli/cli-handlers-pointer.js";
import { parseSessionLine } from "../native-pipeline/cli/cli-runner/session.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner/types.js";
import type { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";

const BACKGROUND_POINTER_REQUIREMENT = {
	name: "state.pointer",
	minVersion: "1.1.0",
	feature: "Background pointer input",
	remediation:
		"Update QCut. Editors advertising state.pointer 1.0.0 can retry with --foreground.",
} as const;

function makeOptions({
	command,
	values = {},
}: {
	command: string;
	values?: Partial<CLIRunOptions>;
}): CLIRunOptions {
	return {
		command,
		outputDir: "./output",
		json: true,
		verbose: false,
		quiet: false,
		saveIntermediates: false,
		...values,
	};
}

function createClient() {
	const post = vi.fn(async () => ({ ok: true }));
	const requireCapability = vi.fn(async () => undefined);
	return {
		client: { post, requireCapability } as unknown as EditorApiClient,
		post,
		requireCapability,
	};
}

describe("editor pointer CLI handlers", () => {
	it("waits using a bounded interactive snapshot", async () => {
		const get = vi.fn(async () => ({
			elements: [
				{
					ref: "@e7",
					name: "Ready to export",
					textPreview: "Ready to export",
					value: null,
				},
			],
		}));
		const client = { get } as unknown as EditorApiClient;
		const result = await waitForEditorUi({
			client,
			options: { text: "Ready", timeoutMs: 100 },
		});

		expect(result.success).toBe(true);
		expect(get).toHaveBeenCalledWith("/api/claude/snapshot", {
			interactive: "true",
			depth: "32",
			maxNodes: "8000",
			maxBytes: String(1024 * 1024),
		});
	});

	it("requires value waits to identify their input", async () => {
		const client = { get: vi.fn() } as unknown as EditorApiClient;
		const result = await waitForEditorUi({
			client,
			options: { value: "" },
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("require --ref");
	});

	it("parses one-shot and session pointer coordinates", () => {
		const oneShot = parseCliArgs([
			"editor:pointer:drag",
			"--from-ref",
			"@e12",
			"--to-x",
			"700",
			"--to-y",
			"0",
			"--foreground",
			"--force",
			"--duration-ms",
			"800",
			"--steps",
			"32",
		]);
		const session = parseSessionLine(
			"editor:pointer:scroll --x 0 --y 500 --delta-y -400",
			{ json: true }
		);

		expect(oneShot).toEqual(
			expect.objectContaining({
				fromRef: "@e12",
				toX: 700,
				toY: 0,
				foreground: true,
				force: true,
				durationMs: 800,
				steps: 32,
			})
		);
		expect(session).toEqual(
			expect.objectContaining({
				command: "editor:pointer:scroll",
				x: 0,
				y: 500,
				deltaY: -400,
			})
		);
	});

	it.each([
		"move",
		"hover",
		"click",
		"double-click",
		"right-click",
	])("routes pointer %s by snapshot ref", async (action) => {
		const { client, post, requireCapability } = createClient();
		const result = await handlePointerCommand({
			client,
			options: makeOptions({
				command: `editor:pointer:${action}`,
				values: { ref: "@e12" },
			}),
		});

		expect(result.success).toBe(true);
		expect(post).toHaveBeenCalledWith(`/api/claude/pointer/${action}`, {
			ref: "@e12",
			inputMode: "background",
		});
		expect(requireCapability).toHaveBeenCalledWith(
			BACKGROUND_POINTER_REQUIREMENT
		);
	});

	it("routes coordinate drag endpoints without losing zero coordinates", async () => {
		const { client, post, requireCapability } = createClient();
		const result = await handlePointerCommand({
			client,
			options: makeOptions({
				command: "editor:pointer:drag",
				values: { fromX: 0, fromY: 700, toX: 800, toY: 700 },
			}),
		});

		expect(result.success).toBe(true);
		expect(post).toHaveBeenCalledWith("/api/claude/pointer/drag", {
			from: { x: 0, y: 700 },
			to: { x: 800, y: 700 },
			inputMode: "background",
			via: undefined,
			holdMs: 120,
			durationMs: 450,
			steps: 24,
			releaseDelayMs: 100,
		});
		expect(requireCapability).toHaveBeenCalledWith(
			BACKGROUND_POINTER_REQUIREMENT
		);
	});

	it("drags flattened interactive list items by semantic index", async () => {
		const before = [
			{
				ref: "@e1",
				parentRef: null,
				role: "button",
				tagName: "button",
				name: "Reorder Main",
				testId: "timeline-track-reorder",
				bounds: { x: 10, y: 100, width: 24, height: 24 },
			},
			{
				ref: "@e2",
				parentRef: null,
				role: "button",
				tagName: "button",
				name: "Reorder Titles",
				testId: "timeline-track-reorder",
				bounds: { x: 10, y: 130, width: 24, height: 24 },
			},
		];
		const after = [
			{
				...before[1],
				ref: "@e1",
				bounds: { x: 10, y: 100, width: 24, height: 24 },
			},
			{
				...before[0],
				ref: "@e2",
				bounds: { x: 10, y: 130, width: 24, height: 24 },
			},
		];
		const get = vi
			.fn()
			.mockResolvedValueOnce({ elements: before })
			.mockResolvedValueOnce({ elements: after });
		const post = vi.fn(async () => ({ action: "drag" }));
		const requireCapability = vi.fn(async () => undefined);
		const client = {
			get,
			post,
			requireCapability,
		} as unknown as EditorApiClient;

		const result = await handlePointerCommand({
			client,
			options: makeOptions({
				command: "editor:pointer:drag",
				values: { fromRef: "@e2", toIndex: 0, verify: true },
			}),
		});

		expect(result.success).toBe(true);
		expect(post).toHaveBeenCalledWith(
			"/api/claude/pointer/drag",
			expect.objectContaining({
				from: { ref: "@e2" },
				to: { x: 22, y: 104.8 },
			})
		);
	});

	it("excludes distant lookalike controls from a flattened list", async () => {
		const taskButton = {
			ref: "@task",
			parentRef: null,
			role: "button",
			tagName: "button",
			name: "Task center",
			testId: null,
			bounds: { x: 12, y: 10, width: 28, height: 28 },
		};
		const tracks = ["Main", "Titles", "Probe"].map((name, index) => ({
			ref: `@track-${index}`,
			parentRef: null,
			role: "button",
			tagName: "button",
			name: `Reorder ${name}`,
			testId: null,
			bounds: { x: 10, y: 100 + index * 30, width: 24, height: 24 },
		}));
		const after = [
			taskButton,
			{ ...tracks[0], ref: "@after-main", bounds: { ...tracks[0].bounds } },
			{ ...tracks[2], ref: "@after-probe", bounds: { ...tracks[1].bounds } },
			{ ...tracks[1], ref: "@after-titles", bounds: { ...tracks[2].bounds } },
		];
		const get = vi
			.fn()
			.mockResolvedValueOnce({ elements: [taskButton, ...tracks] })
			.mockResolvedValueOnce({ elements: after });
		const post = vi.fn(async () => ({ action: "drag" }));
		const client = {
			get,
			post,
			requireCapability: vi.fn(async () => undefined),
		} as unknown as EditorApiClient;

		const result = await handlePointerCommand({
			client,
			options: makeOptions({
				command: "editor:pointer:drag",
				values: { fromRef: "@track-2", toIndex: 1, verify: true },
			}),
		});

		expect(result.success).toBe(true);
		expect(post).toHaveBeenCalledWith(
			"/api/claude/pointer/drag",
			expect.objectContaining({ to: { x: 22, y: 134.8 } })
		);
	});

	it("routes keyboard chords and typed text", async () => {
		const { client, post } = createClient();
		const press = await handleKeyboardCommand({
			client,
			options: makeOptions({
				command: "editor:keyboard:press",
				values: { keys: "META,A", intervalMs: 25 },
			}),
		});
		const type = await handleKeyboardCommand({
			client,
			options: makeOptions({
				command: "editor:keyboard:type",
				values: { text: "QCut automation", intervalMs: 10 },
			}),
		});

		expect(press.success).toBe(true);
		expect(type.success).toBe(true);
		expect(post).toHaveBeenCalledWith("/api/claude/keyboard/press", {
			keys: ["META", "A"],
			intervalMs: 25,
			inputMode: "background",
		});
		expect(post).toHaveBeenCalledWith("/api/claude/keyboard/type", {
			text: "QCut automation",
			intervalMs: 10,
			inputMode: "background",
		});
	});

	it("executes a pointer and keyboard action sequence in order", async () => {
		const { client, post } = createClient();
		const result = await handlePointerCommand({
			client,
			options: makeOptions({
				command: "editor:pointer:sequence",
				values: {
					actions: JSON.stringify([
						{ action: "click", ref: "@e1" },
						{ action: "press", keys: ["META", "A"] },
						{ action: "type", text: "replacement" },
					]),
				},
			}),
		});

		expect(result.success).toBe(true);
		expect(result.data).toEqual(expect.objectContaining({ actionCount: 3 }));
		expect(post.mock.calls.map(([url]) => url)).toEqual([
			"/api/claude/pointer/click",
			"/api/claude/keyboard/press",
			"/api/claude/keyboard/type",
		]);
	});

	it("scopes sequence value waits to the most recently clicked ref", async () => {
		const post = vi.fn(async () => ({ ok: true }));
		const get = vi.fn(async () => ({
			elements: [
				{
					ref: "@input",
					name: "Search",
					value: "QCut",
					bounds: { x: 10, y: 10, width: 100, height: 30 },
				},
			],
		}));
		const client = {
			post,
			get,
			requireCapability: vi.fn(async () => undefined),
		} as unknown as EditorApiClient;
		const result = await handlePointerCommand({
			client,
			options: makeOptions({
				command: "editor:pointer:sequence",
				values: {
					actions: JSON.stringify([
						{ action: "click", ref: "@input" },
						{ action: "type", text: "QCut" },
						{ action: "wait", value: "QCut" },
					]),
				},
			}),
		});

		expect(result.success).toBe(true);
		expect(get).toHaveBeenCalled();
	});

	it("routes wheel deltas at an optional target", async () => {
		const { client, post, requireCapability } = createClient();
		const result = await handlePointerCommand({
			client,
			options: makeOptions({
				command: "editor:pointer:scroll",
				values: { ref: "@e20", deltaY: 400 },
			}),
		});

		expect(result.success).toBe(true);
		expect(post).toHaveBeenCalledWith("/api/claude/pointer/scroll", {
			ref: "@e20",
			inputMode: "background",
			deltaY: 400,
		});
		expect(requireCapability).toHaveBeenCalledWith(
			BACKGROUND_POINTER_REQUIREMENT
		);
	});

	it("resolves semantic targets and scales pointer animation speed", async () => {
		const get = vi.fn(async () => ({
			elements: [
				{
					ref: "@text-tab",
					testId: "text-panel-tab",
					bounds: { x: 20, y: 30, width: 40, height: 40 },
				},
			],
		}));
		const post = vi.fn(async () => ({ action: "click" }));
		const client = {
			get,
			post,
			requireCapability: vi.fn(async () => undefined),
		} as unknown as EditorApiClient;

		const result = await handlePointerCommand({
			client,
			options: makeOptions({
				command: "editor:pointer:click",
				values: { target: "panel.text", speed: 2 },
			}),
		});

		expect(result.success).toBe(true);
		expect(post).toHaveBeenCalledWith("/api/claude/pointer/click", {
			ref: "@text-tab",
			inputMode: "background",
			durationMs: 110,
		});
	});

	it("converts normalized viewport coordinates", async () => {
		const get = vi.fn(async () => ({
			viewport: { width: 1200, height: 800 },
			elements: [],
		}));
		const post = vi.fn(async () => ({ action: "move" }));
		const client = {
			get,
			post,
			requireCapability: vi.fn(async () => undefined),
		} as unknown as EditorApiClient;

		const result = await handlePointerCommand({
			client,
			options: makeOptions({
				command: "editor:pointer:move",
				values: { normalizedX: 0.5, normalizedY: 0.25 },
			}),
		});

		expect(result.success).toBe(true);
		expect(post).toHaveBeenCalledWith("/api/claude/pointer/move", {
			x: 600,
			y: 200,
			inputMode: "background",
		});
	});

	it("separates semantic playhead seek from its display-only animation", async () => {
		let sought = false;
		const get = vi.fn(async (url: string) => {
			if (url === "/api/claude/navigator/projects") {
				return { activeProjectId: "project-1" };
			}
			if (url === "/api/claude/snapshot") {
				return {
					elements: [
						{
							ref: "@playhead",
							testId: "timeline-playhead",
							bounds: {
								x: sought ? 500 : 100,
								y: 300,
								width: 2,
								height: 200,
							},
						},
					],
				};
			}
			throw new Error(`Unexpected GET ${url}`);
		});
		const post = vi.fn(async (url: string) => {
			if (url.includes("/playback")) sought = true;
			return { url };
		});
		const client = {
			get,
			post,
			requireCapability: vi.fn(async () => undefined),
		} as unknown as EditorApiClient;

		const result = await handlePointerCommand({
			client,
			options: makeOptions({
				command: "editor:pointer:drag",
				values: {
					from: "timeline.playhead",
					toTime: 12,
					projectId: "project-1",
				},
			}),
		});

		expect(result.success).toBe(true);
		expect(post).toHaveBeenCalledWith(
			"/api/claude/timeline/project-1/playback",
			{ action: "seek", time: 12 }
		);
		expect(post.mock.calls.map(([url]) => url)).not.toContain(
			"/api/claude/pointer/drag"
		);
		expect(result.data).toEqual(
			expect.objectContaining({
				animation: expect.objectContaining({ type: "display-only" }),
			})
		);
	});

	it("routes explicit foreground input without changing the target", async () => {
		const { client, post, requireCapability } = createClient();
		const result = await handlePointerCommand({
			client,
			options: makeOptions({
				command: "editor:pointer:click",
				values: { ref: "@e12", foreground: true },
			}),
		});

		expect(result.success).toBe(true);
		expect(post).toHaveBeenCalledWith("/api/claude/pointer/click", {
			ref: "@e12",
			inputMode: "foreground",
		});
		expect(requireCapability).not.toHaveBeenCalled();
	});

	it("rejects background input when the running editor is too old", async () => {
		const { client, post, requireCapability } = createClient();
		requireCapability.mockRejectedValue(
			new Error(
				"Background pointer input requires QCut capability 'state.pointer' 1.1.0+"
			)
		);

		await expect(
			handlePointerCommand({
				client,
				options: makeOptions({
					command: "editor:pointer:click",
					values: { ref: "@e12" },
				}),
			})
		).rejects.toThrow("state.pointer");
		expect(post).not.toHaveBeenCalled();
	});

	it("rejects ambiguous and partial pointer targets before sending a request", async () => {
		const { client, post } = createClient();

		const ambiguous = await handlePointerCommand({
			client,
			options: makeOptions({
				command: "editor:pointer:click",
				values: { ref: "@e12", x: 100, y: 200 },
			}),
		});
		const partialScroll = await handlePointerCommand({
			client,
			options: makeOptions({
				command: "editor:pointer:scroll",
				values: { x: 100, deltaY: 400 },
			}),
		});

		expect(ambiguous.success).toBe(false);
		expect(ambiguous.error).toContain("either --ref or coordinates");
		expect(partialScroll.success).toBe(false);
		expect(partialScroll.error).toContain("both --x");
		expect(post).not.toHaveBeenCalled();
	});

	it("routes hide and validates incomplete targets", async () => {
		const { client, post, requireCapability } = createClient();
		const hideResult = await handlePointerCommand({
			client,
			options: makeOptions({ command: "editor:pointer:hide" }),
		});
		expect(hideResult.success).toBe(true);
		expect(post).toHaveBeenCalledWith("/api/claude/pointer/hide", {});
		expect(requireCapability).not.toHaveBeenCalled();

		const invalidResult = await handlePointerCommand({
			client,
			options: makeOptions({
				command: "editor:pointer:move",
				values: { x: 100 },
			}),
		});
		expect(invalidResult.success).toBe(false);
		expect(invalidResult.error).toContain("both --x");
	});
});
