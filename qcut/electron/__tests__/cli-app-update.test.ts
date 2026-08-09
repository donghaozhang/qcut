import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";
import { getCommand } from "../native-pipeline/cli/command-registry.js";
import { HANDLER_MAP } from "../native-pipeline/cli/cli-runner/handler-map.js";

describe("QCut app update CLI", () => {
	it("registers the update command and its safety flags", () => {
		const command = getCommand("update");

		expect(command?.category).toBe("application");
		expect(command?.flags.map((flag) => flag.name)).toEqual([
			"--check",
			"--yes",
			"--no-launch",
		]);
		expect(HANDLER_MAP.update).toBeTypeOf("function");
	});

	it("parses check, confirmation, and relaunch controls", () => {
		const options = parseCliArgs(["update", "--check", "--yes", "--no-launch"]);

		expect(options.command).toBe("update");
		expect(options.checkOnly).toBe(true);
		expect(options.yes).toBe(true);
		expect(options.noLaunch).toBe(true);
	});
});
