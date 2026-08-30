import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../cli";
import { getCommand, getCommandFlag } from "../command-registry";

describe("compose CLI registration", () => {
	it("parses validate and render", () => {
		const validate = parseCliArgs([
			"compose",
			"validate",
			"--config",
			"edit.json",
			"--output",
			"lock.json",
		]);
		const render = parseCliArgs([
			"compose",
			"render",
			"-c",
			"edit.json",
			"--output",
			"final.mp4",
			"--force",
		]);

		expect(validate).toMatchObject({
			command: "compose-validate",
			config: "edit.json",
			output: "lock.json",
		});
		expect(render).toMatchObject({
			command: "compose-render",
			config: "edit.json",
			output: "final.mp4",
			force: true,
		});
	});

	it("parses a portable project destination", () => {
		const options = parseCliArgs([
			"compose",
			"project",
			"--config",
			"edit.json",
			"--project-dir",
			"portable-edit",
		]);

		expect(options).toMatchObject({
			command: "compose-project",
			config: "edit.json",
			projectDir: "portable-edit",
		});
		expect(getCommand("compose-project")?.category).toBe("composition");
		expect(getCommandFlag("compose-project", "--project-dir")?.type).toBe(
			"string"
		);
	});
});
