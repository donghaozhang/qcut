import { describe, expect, test } from "vitest";
import { parseCliArgs } from "../cli";
import { resolveCommandGroup } from "../command-groups";
import { getCommand, getCommandFlag } from "../command-registry";

describe("Sticker Lab command registry", () => {
	test("routes every Sticker Lab group action", () => {
		for (const [action, command] of [
			["catalogs", "sticker-lab-catalogs"],
			["categories", "sticker-lab-categories"],
			["items", "sticker-lab-items"],
			["search", "sticker-lab-search"],
		] as const) {
			expect(resolveCommandGroup(["sticker-lab", action])).toEqual({
				command,
				remainingArgs: [],
			});
			expect(getCommand(command)?.category).toBe("sticker-lab");
		}
	});

	test("parses browse filters and pagination", () => {
		const options = parseCliArgs([
			"sticker-lab",
			"items",
			"--root",
			"/private/sticker-lab",
			"--batch-id",
			"jianying-2026-08-23-batch-18-v2",
			"--category",
			"热门",
			"--query",
			"安排",
			"--offset",
			"10",
			"--limit",
			"25",
		]);

		expect(options).toMatchObject({
			command: "sticker-lab-items",
			root: "/private/sticker-lab",
			batchId: "jianying-2026-08-23-batch-18-v2",
			category: "热门",
			query: "安排",
			offset: 10,
			limit: 25,
		});
	});

	test("documents the required search query", () => {
		expect(getCommandFlag("sticker-lab-search", "--query")).toMatchObject({
			name: "--query",
			required: true,
		});
	});

	test("parses an explicit local provider for editor sticker add", () => {
		const options = parseCliArgs([
			"editor",
			"sticker",
			"add",
			"--project-id",
			"project-1",
			"--provider",
			"sticker-lab",
			"--batch-id",
			"jianying-2026-08-23-batch-18-v2",
			"--sticker-id",
			"7134619769205951784",
			"--root",
			"/private/sticker-lab",
			"--end-time",
			"5",
		]);

		expect(options).toMatchObject({
			command: "editor:sticker:add",
			projectId: "project-1",
			provider: "sticker-lab",
			batchId: "jianying-2026-08-23-batch-18-v2",
			stickerId: "7134619769205951784",
			root: "/private/sticker-lab",
			endTime: 5,
		});
	});
});
