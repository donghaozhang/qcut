import { join, posix, win32 } from "node:path";
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

const ACTIONS = [
	"inspect",
	"plan",
	"import",
	"commit",
	"verify-roundtrip",
] as const;

describe("jianying-import command registration", () => {
	it("registers all Jianying import commands in the registry", () => {
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

	it("resolves the concise draft import command", () => {
		const resolved = resolveCommandGroup([
			"draft",
			"import",
			"--format",
			"jianying",
			"--draft",
			"/tmp/x",
		]);
		expect(resolved).toEqual({
			command: "editor:jianying-import:import",
			remainingArgs: ["--format", "jianying", "--draft", "/tmp/x"],
		});
	});

	it("resolves the concise Jianying round-trip verification command", () => {
		const resolved = resolveCommandGroup([
			"draft",
			"verify-roundtrip",
			"--format",
			"jianying",
			"--draft",
			"/tmp/x",
		]);
		expect(resolved).toEqual({
			command: "editor:jianying-import:verify-roundtrip",
			remainingArgs: ["--format", "jianying", "--draft", "/tmp/x"],
		});
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
				return { outcome: "exact", product: "jianying" };
			}

			async verifyRoundTrip({ input }: { input: unknown }) {
				calls.push({ verb: "verify-roundtrip", input });
				return {
					inspect: { outcome: "exact", product: "jianying" },
					result: {
						ok: true,
						verification: {
							byteIdentical: true,
							contentRelativePath: "draft_content.json",
						},
					},
				};
			}

			async plan({ input }: { input: unknown }) {
				calls.push({ verb: "plan", input });
				return {
					plan: {
						planToken: "token",
						canCommit: true,
						warningFingerprints: ["warning"],
					},
					inspect: {
						outcome: "exact",
						product: "jianying",
						sourceScope: "compound-subdraft",
						subdraftCandidateCount: 1,
						selectedSubdraftId: "compound-1",
					},
					cacheMetrics: {
						assetResolution: {
							schemaVersion: 1,
							fileProbeHits: 3,
							fileProbeMisses: 1,
						},
					},
					stageMetrics: {
						schemaVersion: 1,
						phase: "runtime-plan",
						measuredDurationMilliseconds: 7,
						stages: {
							"asset-resolution": {
								durationMilliseconds: 7,
								invocationCount: 1,
							},
						},
					},
				};
			}

			async commitWithMediaGrants({ input }: { input: unknown }) {
				calls.push({ verb: "commit-grants", input });
				return {
					bundle: {
						planToken: "token",
						document: { source: { product: "jianying" } },
					},
					mediaGrants: [{ grantToken: "grant-token" }],
				};
			}

			async readMediaPayloadChunk({ input }: { input: unknown }) {
				calls.push({ verb: "read-chunk", input });
				return { bytes: new Uint8Array(), eof: true };
			}

			releaseMediaPayloadGrants({ input }: { input: unknown }) {
				calls.push({ verb: "release-grants", input });
				return { releasedCount: 1 };
			}

			dispose() {
				calls.push({ verb: "dispose", input: null });
			}
		}
		return {
			module: {
				JianyingDraftImportSession: FakeSession,
				enqueueDesktopImportFromGrants: async (input: {
					readChunk: (options: { input: unknown }) => Promise<unknown>;
					[key: string]: unknown;
				}) => {
					const { readChunk, ...recordedInput } = input;
					calls.push({ verb: "enqueue-grants", input: recordedInput });
					await readChunk({ input: { grantToken: "grant-token" } });
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

	it("runs Jianying round-trip verification offline and read-only", async () => {
		const runtime = createRuntime();
		const result = await executeJianyingImportCommand({
			options: makeOpts({
				command: "editor:jianying-import:verify-roundtrip",
				draftPaths: ["/drafts/my-draft"],
				format: "jianying",
			}),
			loadRuntime: async () => runtime.module,
			getUserDataDirectory: () => "/qcut-user-data",
		});

		expect(result).toMatchObject({
			success: true,
			data: {
				action: "verify-roundtrip",
				localOnly: true,
				readOnly: true,
				result: {
					result: { ok: true, verification: { byteIdentical: true } },
				},
			},
		});
		expect(runtime.calls[0]).toEqual({
			verb: "verify-roundtrip",
			input: { draftPath: "/drafts/my-draft" },
		});
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

	it("returns asset cache metrics from offline planning", async () => {
		const runtime = createRuntime();
		const result = await executeJianyingImportCommand({
			options: makeOpts({
				command: "editor:jianying-import:plan",
				draftPaths: ["/drafts/my-draft"],
			}),
			loadRuntime: async () => runtime.module,
			getUserDataDirectory: () => "/qcut-user-data",
		});

		expect(result.data).toMatchObject({
			result: {
				cacheMetrics: {
					assetResolution: {
						schemaVersion: 1,
						fileProbeHits: 3,
						fileProbeMisses: 1,
					},
				},
				stageMetrics: {
					schemaVersion: 1,
					phase: "runtime-plan",
					measuredDurationMilliseconds: 7,
					stages: {
						"asset-resolution": {
							durationMilliseconds: 7,
							invocationCount: 1,
						},
					},
				},
			},
		});
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
			storageDirectory: join("/qcut-user-data", "jianying-import", "plans-cli"),
		});
		expect(runtime.calls.slice(0, 4)).toEqual([
			{
				verb: "commit-grants",
				input: {
					planToken: "t",
					acceptedWarningFingerprints: ["warning"],
				},
			},
			{
				verb: "enqueue-grants",
				input: {
					inboxDirectory: join("/qcut-user-data", "jianying-import", "inbox"),
					commit: {
						bundle: {
							planToken: "token",
							document: { source: { product: "jianying" } },
						},
						mediaGrants: [{ grantToken: "grant-token" }],
					},
				},
			},
			{ verb: "read-chunk", input: { grantToken: "grant-token" } },
			{
				verb: "release-grants",
				input: { grantTokens: ["grant-token"] },
			},
		]);
	});

	it("plans and queues a Jianying draft through the concise import command", async () => {
		const runtime = createRuntime();
		const result = await executeJianyingImportCommand({
			options: makeOpts({
				command: "editor:jianying-import:import",
				draftPaths: ["/drafts/my-draft"],
				format: "jianying",
				acceptedWarningFingerprints: ["warning"],
			}),
			loadRuntime: async () => runtime.module,
			getUserDataDirectory: () => "/qcut-user-data",
		});

		expect(result).toMatchObject({
			success: true,
			data: {
				action: "import",
				queuedForDesktop: true,
				sourceScope: "compound-subdraft",
				subdraftCandidateCount: 1,
				selectedSubdraftId: "compound-1",
				inboxEntry: { entryId: "entry-1" },
			},
		});
		expect(runtime.calls[0]).toEqual({
			verb: "plan",
			input: { draftPath: "/drafts/my-draft" },
		});
		expect(runtime.calls[1]).toEqual({
			verb: "commit-grants",
			input: {
				planToken: "token",
				acceptedWarningFingerprints: ["warning"],
			},
		});
	});

	it("releases media grants when inbox streaming fails", async () => {
		const runtime = createRuntime();
		runtime.module.enqueueDesktopImportFromGrants = async () => {
			runtime.calls.push({ verb: "enqueue-failed", input: null });
			throw new Error("inbox write failed");
		};
		const result = await executeJianyingImportCommand({
			options: makeOpts({
				command: "editor:jianying-import:commit",
				planToken: "t",
				acceptedWarningFingerprints: [],
			}),
			loadRuntime: async () => runtime.module,
			getUserDataDirectory: () => "/qcut-user-data",
		});

		expect(result).toMatchObject({
			success: false,
			error: "inbox write failed",
		});
		expect(runtime.calls).toContainEqual({
			verb: "release-grants",
			input: { grantTokens: ["grant-token"] },
		});
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
				enqueueDesktopImportFromGrants: async () => ({ entryId: "unused" }),
			}),
			getUserDataDirectory: () => "/qcut-user-data",
		});
		expect(result.success).toBe(false);
		expect(result.error).toContain("not a directory");
	});

	it("rejects an exact CapCut profile from the Jianying command", async () => {
		class CapCutSession {
			async inspect() {
				return { outcome: "exact", product: "capcut" };
			}

			dispose() {}
		}
		const result = await executeJianyingImportCommand({
			options: makeOpts({
				command: "editor:jianying-import:inspect",
				draftPaths: ["/drafts/capcut"],
			}),
			loadRuntime: async () => ({
				JianyingDraftImportSession: CapCutSession,
				enqueueDesktopImportFromGrants: async () => ({ entryId: "unused" }),
			}),
			getUserDataDirectory: () => "/qcut-user-data",
		});

		expect(result).toMatchObject({
			success: false,
			error: expect.stringContaining("not verified as Jianying"),
		});
	});

	it("rejects a CapCut format before loading the runtime", async () => {
		const runtime = createRuntime();
		const result = await executeJianyingImportCommand({
			options: makeOpts({
				command: "editor:jianying-import:import",
				draftPaths: ["/drafts/capcut"],
				format: "capcut",
			}),
			loadRuntime: async () => runtime.module,
		});

		expect(result).toMatchObject({
			success: false,
			error: expect.stringContaining('must be "jianying"'),
		});
		expect(runtime.calls).toEqual([]);
	});
});

describe("resolveBundledImportRuntimePath", () => {
	it("uses the adjacent runtime from a compiled Electron layout", () => {
		const runtimePath = join(
			"/repo",
			"dist",
			"electron",
			"jianying-draft-import-runtime.js"
		);
		expect(
			resolveBundledImportRuntimePath({
				moduleDirectory: join(
					"/repo",
					"dist",
					"electron",
					"native-pipeline",
					"editor"
				),
				fileExists: (path) => path === runtimePath,
			})
		).toBe(runtimePath);
	});

	it("uses the built runtime when the CLI runs from TypeScript source", () => {
		expect(
			resolveBundledImportRuntimePath({
				moduleDirectory: join("/repo", "electron", "native-pipeline", "editor"),
				fileExists: () => false,
			})
		).toBe(
			join("/repo", "dist", "electron", "jianying-draft-import-runtime.js")
		);
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
		).toBe(
			posix.join("/Users/peter", "Library", "Application Support", "qcut")
		);
		expect(
			resolveQCutCliUserDataDirectory({
				environment: { APPDATA: "C:\\Users\\peter\\AppData\\Roaming" },
				homeDirectory: "C:\\Users\\peter",
				moduleDirectory: "C:\\repo\\electron\\native-pipeline\\editor",
				platform: "win32",
			})
		).toBe(win32.join("C:\\Users\\peter\\AppData\\Roaming", "qcut"));
		expect(
			resolveQCutCliUserDataDirectory({
				environment: { XDG_CONFIG_HOME: "/config" },
				homeDirectory: "/home/peter",
				moduleDirectory: "/repo/electron/native-pipeline/editor",
				platform: "linux",
			})
		).toBe(posix.join("/config", "qcut"));
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
			posix.join(
				"/Users/peter",
				"Library",
				"Application Support",
				"QCut AI Video Editor"
			)
		);
	});
});
