import { describe, expect, it } from "vitest";
import { getCommand } from "../native-pipeline/cli/command-registry.js";
import { resolveCommandGroup } from "../native-pipeline/cli/command-groups.js";
import {
	executeJianyingImportCommand,
	resolveBundledImportRuntimePath,
	resolveQCutCliUserDataDirectory,
} from "../native-pipeline/editor/editor-handlers-jianying-import.js";
import { makeOpts } from "./editor-cli-test-setup.js";

/** JYI-012 acceptance (CLI side): registration, dispatch, offline handler. */

const ACTIONS = ["inspect", "plan", "commit"] as const;

describe("jianying-import command registration", () => {
	it("registers all three commands in the registry", () => {
		for (const action of ACTIONS) {
			const command = getCommand(`editor:jianying-import:${action}`);
			expect(command, action).toBeDefined();
			expect(command?.category).toBe("editor");
		}
	});

	it("resolves the 3-level group form", () => {
		const resolved = resolveCommandGroup([
			"editor",
			"jianying-import",
			"inspect",
			"--draft",
			"/tmp/x",
		]);
		expect(resolved?.command).toBe("editor:jianying-import:inspect");
	});
});

describe("executeJianyingImportCommand", () => {
	function createRuntime() {
		const calls: Array<{ verb: string; input: unknown }> = [];
		const constructedWith: unknown[] = [];
		class FakeSession {
			constructor(options: unknown) {
				constructedWith.push(options);
			}

			static async open(options: unknown) {
				return new FakeSession(options);
			}

			async inspect({ input }: { input: unknown }) {
				calls.push({ verb: "inspect", input });
				return { outcome: "exact" };
			}

			async plan({ input }: { input: unknown }) {
				calls.push({ verb: "plan", input });
				return { plan: { planToken: "token" } };
			}

			async commit({ input }: { input: unknown }) {
				calls.push({ verb: "commit", input });
				return { bundle: { planToken: "token" }, mediaPayloads: [] };
			}

			dispose() {
				calls.push({ verb: "dispose", input: null });
			}
		}
		return {
			module: {
				JianyingDraftImportSession: FakeSession,
				enqueueDesktopImport: async (input: unknown) => {
					calls.push({ verb: "enqueue", input });
					return { entryId: "entry-1" };
				},
			},
			calls,
			constructedWith,
		};
	}

	it("runs inspect offline via the bundled runtime", async () => {
		const runtime = createRuntime();
		const result = await executeJianyingImportCommand({
			options: makeOpts({
				command: "editor:jianying-import:inspect",
				draftPaths: ["/drafts/my-draft"],
			}),
			loadRuntime: async () => runtime.module,
			getUserDataDirectory: () => "/qcut-user-data",
		});
		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			action: "inspect",
			readOnly: true,
			localOnly: true,
		});
		expect(runtime.calls[0]).toEqual({
			verb: "inspect",
			input: { draftPath: "/drafts/my-draft" },
		});
		expect(runtime.calls.at(-1)?.verb).toBe("dispose");
	});

	it("requires --draft for inspect and plan", async () => {
		const runtime = createRuntime();
		const result = await executeJianyingImportCommand({
			options: makeOpts({ command: "editor:jianying-import:plan" }),
			loadRuntime: async () => runtime.module,
		});
		expect(result.success).toBe(false);
		expect(result.error).toContain("--draft");
		expect(runtime.calls).toEqual([]);
	});

	it("commits a durable plan into the desktop inbox", async () => {
		const runtime = createRuntime();
		const result = await executeJianyingImportCommand({
			options: makeOpts({
				command: "editor:jianying-import:commit",
				planToken: "t",
				acceptedWarningFingerprints: ["warning"],
			}),
			loadRuntime: async () => runtime.module,
			getUserDataDirectory: () => "/qcut-user-data",
		});
		expect(result).toMatchObject({
			success: true,
			data: {
				action: "commit",
				queuedForDesktop: true,
				inboxEntry: { entryId: "entry-1" },
			},
		});
		expect(runtime.constructedWith[0]).toMatchObject({
			storageDirectory: "/qcut-user-data/jianying-import/plans-cli",
		});
		expect(runtime.calls.slice(0, 2)).toEqual([
			{
				verb: "commit",
				input: {
					planToken: "t",
					acceptedWarningFingerprints: ["warning"],
				},
			},
			{
				verb: "enqueue",
				input: {
					inboxDirectory: "/qcut-user-data/jianying-import/inbox",
					commit: { bundle: { planToken: "token" }, mediaPayloads: [] },
				},
			},
		]);
	});

	it("returns session errors as CLIResult errors, never throws", async () => {
		class ThrowingSession {
			async inspect(): Promise<never> {
				throw new Error("draft path is not a directory");
			}

			dispose() {}
		}
		const result = await executeJianyingImportCommand({
			options: makeOpts({
				command: "editor:jianying-import:inspect",
				draftPaths: ["/nope"],
			}),
			loadRuntime: async () => ({
				JianyingDraftImportSession: ThrowingSession,
				enqueueDesktopImport: async () => ({ entryId: "unused" }),
			}),
			getUserDataDirectory: () => "/qcut-user-data",
		});
		expect(result.success).toBe(false);
		expect(result.error).toContain("not a directory");
	});
});

describe("resolveBundledImportRuntimePath", () => {
	it("uses the adjacent runtime from a compiled Electron layout", () => {
		expect(
			resolveBundledImportRuntimePath({
				moduleDirectory: "/repo/dist/electron/native-pipeline/editor",
				fileExists: (path) =>
					path === "/repo/dist/electron/jianying-draft-import-runtime.js",
			})
		).toBe("/repo/dist/electron/jianying-draft-import-runtime.js");
	});

	it("uses the built runtime when the CLI runs from TypeScript source", () => {
		expect(
			resolveBundledImportRuntimePath({
				moduleDirectory: "/repo/electron/native-pipeline/editor",
				fileExists: () => false,
			})
		).toBe("/repo/dist/electron/jianying-draft-import-runtime.js");
	});
});

describe("resolveQCutCliUserDataDirectory", () => {
	it("uses an absolute override before platform defaults", () => {
		expect(
			resolveQCutCliUserDataDirectory({
				environment: { QCUT_USER_DATA_PATH: "/private/qcut-data" },
				homeDirectory: "/home/peter",
				platform: "linux",
			})
		).toBe("/private/qcut-data");
		expect(() =>
			resolveQCutCliUserDataDirectory({
				environment: { QCUT_USER_DATA_PATH: "relative" },
				homeDirectory: "/home/peter",
				platform: "linux",
			})
		).toThrow(/absolute path/u);
	});

	it("matches the development desktop directory from source", () => {
		expect(
			resolveQCutCliUserDataDirectory({
				environment: {},
				homeDirectory: "/Users/peter",
				moduleDirectory: "/repo/electron/native-pipeline/editor",
				platform: "darwin",
			})
		).toBe("/Users/peter/Library/Application Support/qcut");
		expect(
			resolveQCutCliUserDataDirectory({
				environment: { APPDATA: "C:\\Users\\peter\\AppData\\Roaming" },
				homeDirectory: "C:\\Users\\peter",
				moduleDirectory: "C:\\repo\\electron\\native-pipeline\\editor",
				platform: "win32",
			})
		).toBe("C:\\Users\\peter\\AppData\\Roaming/qcut");
		expect(
			resolveQCutCliUserDataDirectory({
				environment: { XDG_CONFIG_HOME: "/config" },
				homeDirectory: "/home/peter",
				moduleDirectory: "/repo/electron/native-pipeline/editor",
				platform: "linux",
			})
		).toBe("/config/qcut");
	});

	it("targets the packaged desktop product from a compiled CLI", () => {
		expect(
			resolveQCutCliUserDataDirectory({
				environment: {},
				homeDirectory: "/Users/peter",
				moduleDirectory: "/repo/dist/electron/native-pipeline/editor",
				platform: "darwin",
			})
		).toBe(
			"/Users/peter/Library/Application Support/QCut AI Video Editor"
		);
	});
});
