import { describe, expect, it, vi } from "vitest";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";
import { handlePointerCommand } from "../native-pipeline/cli/cli-handlers-pointer.js";
import { parseSessionLine } from "../native-pipeline/cli/cli-runner/session.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner/types.js";
import type { EditorApiClient } from "../native-pipeline/editor/editor-api-client.js";

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
	return {
		client: { post } as unknown as EditorApiClient,
		post,
	};
}

describe("editor pointer CLI handlers", () => {
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
		const { client, post } = createClient();
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
	});

	it("routes coordinate drag endpoints without losing zero coordinates", async () => {
		const { client, post } = createClient();
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
		});
	});

	it("routes wheel deltas at an optional target", async () => {
		const { client, post } = createClient();
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
	});

	it("routes explicit foreground input without changing the target", async () => {
		const { client, post } = createClient();
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
		const { client, post } = createClient();
		const hideResult = await handlePointerCommand({
			client,
			options: makeOptions({ command: "editor:pointer:hide" }),
		});
		expect(hideResult.success).toBe(true);
		expect(post).toHaveBeenCalledWith("/api/claude/pointer/hide", {});

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
