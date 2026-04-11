import { describe, expect, it, vi, afterEach } from "vitest";
import {
	resolveCommandGroup,
	isCommandGroup,
	getCommandGroup,
	COMMAND_GROUPS,
} from "../native-pipeline/cli/command-groups.js";
import { COMMANDS_REGISTRY, getCommand } from "../native-pipeline/cli/command-registry.js";
import { HANDLER_MAP } from "../native-pipeline/cli/cli-runner/handler-map.js";
import { COMMAND_ALIASES, warnIfDeprecated } from "../native-pipeline/cli/aliases.js";
import { ModelRegistry } from "../native-pipeline/infra/registry.js";
import { initRegistry, resetInitState } from "../native-pipeline/init.js";

describe("Command Groups", () => {
	beforeEach(() => {
		ModelRegistry.clear();
		resetInitState();
		initRegistry();
	});

	describe("resolveCommandGroup", () => {
		it("resolves 'gen image' to 'generate-image'", () => {
			const result = resolveCommandGroup(["gen", "image"]);
			expect(result).toEqual({ command: "generate-image", remainingArgs: [] });
		});

		it("resolves 'flow idea2video' to 'vimax:idea2video'", () => {
			const result = resolveCommandGroup(["flow", "idea2video"]);
			expect(result).toEqual({ command: "vimax:idea2video", remainingArgs: [] });
		});

		it("resolves 'system models' to 'list-models'", () => {
			const result = resolveCommandGroup(["system", "models"]);
			expect(result).toEqual({ command: "list-models", remainingArgs: [] });
		});

		it("resolves 'analyze transcribe' to 'transcribe'", () => {
			const result = resolveCommandGroup(["analyze", "transcribe"]);
			expect(result).toEqual({ command: "transcribe", remainingArgs: [] });
		});

		it("resolves 'gen tts' to 'generate-speech'", () => {
			const result = resolveCommandGroup(["gen", "tts"]);
			expect(result).toEqual({ command: "generate-speech", remainingArgs: [] });
		});

		it("resolves 'analyze translate' to 'translate-video'", () => {
			const result = resolveCommandGroup(["analyze", "translate"]);
			expect(result).toEqual({ command: "translate-video", remainingArgs: [] });
		});

		it("resolves 'edit autoclip' to 'autoclip'", () => {
			const result = resolveCommandGroup(["edit", "autoclip"]);
			expect(result).toEqual({ command: "autoclip", remainingArgs: [] });
		});

		it("passes remaining args through", () => {
			const result = resolveCommandGroup(["gen", "image", "--text", "cat"]);
			expect(result).toEqual({
				command: "generate-image",
				remainingArgs: ["--text", "cat"],
			});
		});

		it("returns null for unknown group", () => {
			expect(resolveCommandGroup(["unknown", "action"])).toBeNull();
		});

		it("returns null for known group with unknown action", () => {
			expect(resolveCommandGroup(["gen", "unknown"])).toBeNull();
		});

		it("returns null for empty argv", () => {
			expect(resolveCommandGroup([])).toBeNull();
		});

		it("returns null when action is a flag (group --help)", () => {
			expect(resolveCommandGroup(["gen", "--help"])).toBeNull();
		});
	});

	describe("isCommandGroup", () => {
		it("returns true for known groups", () => {
			expect(isCommandGroup("gen")).toBe(true);
			expect(isCommandGroup("analyze")).toBe(true);
			expect(isCommandGroup("edit")).toBe(true);
			expect(isCommandGroup("flow")).toBe(true);
			expect(isCommandGroup("system")).toBe(true);
		});

		it("returns false for unknown names", () => {
			expect(isCommandGroup("generate-image")).toBe(false);
			expect(isCommandGroup("audio")).toBe(false);
			expect(isCommandGroup("unknown")).toBe(false);
		});
	});

	describe("getCommandGroup", () => {
		it("returns group definition", () => {
			const group = getCommandGroup("gen");
			expect(group).toBeDefined();
			expect(group!.label).toBe("Generation");
		});

		it("returns undefined for unknown group", () => {
			expect(getCommandGroup("unknown")).toBeUndefined();
		});
	});

	describe("all group actions map to registered commands", () => {
		for (const group of COMMAND_GROUPS) {
			for (const [action, command] of Object.entries(group.actions)) {
				it(`${group.name} ${action} → ${command}`, () => {
					const cmd = getCommand(command);
					expect(cmd).toBeDefined();
				});
			}
		}
	});
});

describe("Handler Map", () => {
	beforeEach(() => {
		ModelRegistry.clear();
		resetInitState();
		initRegistry();
	});

	it("has a handler for every non-editor command in COMMANDS_REGISTRY", () => {
		const missing: string[] = [];
		for (const commandName of Object.keys(COMMANDS_REGISTRY)) {
			if (commandName.startsWith("editor:")) continue;
			if (!HANDLER_MAP[commandName]) {
				missing.push(commandName);
			}
		}
		// All non-editor commands should have handlers
		expect(missing).toEqual([]);
		for (const commandName of Object.keys(HANDLER_MAP)) {
			expect(typeof HANDLER_MAP[commandName]).toBe("function");
		}
	});

	it("has no orphan handlers (handler without registry entry)", () => {
		const orphans: string[] = [];
		for (const commandName of Object.keys(HANDLER_MAP)) {
			if (!COMMANDS_REGISTRY[commandName]) {
				orphans.push(commandName);
			}
		}
		expect(orphans).toEqual([]);
	});

	it("all group actions have handlers", () => {
		const missing: string[] = [];
		for (const group of COMMAND_GROUPS) {
			for (const [action, command] of Object.entries(group.actions)) {
				if (!HANDLER_MAP[command] && !command.startsWith("editor:")) {
					missing.push(`${group.name} ${action} → ${command}`);
				}
			}
		}
		expect(missing).toEqual([]);
	});
});

describe("Aliases & Deprecation", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("warns for flat command not resolved via group", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		warnIfDeprecated("generate-image", false);
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("DEPRECATED"));
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("gen image"));
		spy.mockRestore();
	});

	it("warns with analyze transcribe for old transcribe command", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		warnIfDeprecated("transcribe", false);
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("analyze transcribe"));
	});

	it("does not warn for group-resolved command", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		warnIfDeprecated("generate-image", true);
		expect(spy).not.toHaveBeenCalled();
	});

	it("does not warn for unknown command", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		warnIfDeprecated("some-unknown-cmd", false);
		expect(spy).not.toHaveBeenCalled();
	});

	it("does not warn in quiet mode", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		warnIfDeprecated("generate-image", false, true);
		expect(spy).not.toHaveBeenCalled();
	});

	it("every alias maps to a valid command in COMMANDS_REGISTRY", () => {
		for (const [command, suggestion] of Object.entries(COMMAND_ALIASES)) {
			expect(
				COMMANDS_REGISTRY[command],
				`Alias "${command}" → "${suggestion}" has no registry entry`,
			).toBeDefined();
		}
	});
});
