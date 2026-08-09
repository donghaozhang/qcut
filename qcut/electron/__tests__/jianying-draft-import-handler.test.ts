import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	JIANYING_IMPORT_CHOOSE_DIRECTORY_CHANNEL,
	JIANYING_IMPORT_COMMIT_CHANNEL,
	JIANYING_IMPORT_INBOX_ACK_CHANNEL,
	JIANYING_IMPORT_INBOX_LIST_CHANNEL,
	JIANYING_IMPORT_INBOX_READ_CHANNEL,
	JIANYING_IMPORT_INSPECT_CHANNEL,
	JIANYING_IMPORT_MEDIA_CHUNK_CHANNEL,
	JIANYING_IMPORT_MEDIA_RELEASE_CHANNEL,
	JIANYING_IMPORT_PLAN_CHANNEL,
	type JianyingDraftImportResultDto,
} from "../jianying-draft-import-contract.js";

const { mockHandle, mockRemoveHandler, mockShowOpenDialog } = vi.hoisted(
	() => ({
		mockHandle: vi.fn(),
		mockRemoveHandler: vi.fn(),
		mockShowOpenDialog: vi.fn(),
	})
);

vi.mock("electron", () => ({
	app: { getPath: vi.fn(), getVersion: vi.fn(() => "2026.08.04.1") },
	dialog: { showOpenDialog: mockShowOpenDialog },
	ipcMain: { handle: mockHandle, removeHandler: mockRemoveHandler },
	safeStorage: {},
}));

import {
	setupJianyingDraftImportIPC,
	type JianyingDraftImportIPCController,
} from "../jianying-draft-import-handler.js";

/** JYI-012 acceptance (IPC side): trusted transport over the runtime. */

function createMockWindowContext() {
	const mainFrame = {};
	const webContents = { isDestroyed: vi.fn(() => false), mainFrame };
	const mainWindow = {
		isDestroyed: vi.fn(() => false),
		webContents,
	} as unknown as BrowserWindow;
	return {
		event: {
			sender: webContents,
			senderFrame: mainFrame,
		} as unknown as IpcMainInvokeEvent,
		iframeEvent: {
			sender: webContents,
			senderFrame: {},
		} as unknown as IpcMainInvokeEvent,
		mainWindow,
	};
}

function getHandler({ channel }: { channel: string }) {
	const registration = mockHandle.mock.calls.find(
		(call: unknown[]) => call[0] === channel
	);
	if (!registration) throw new Error(`Missing IPC handler for ${channel}`);
	return registration[1] as (
		event: IpcMainInvokeEvent,
		input: unknown
	) => Promise<JianyingDraftImportResultDto<unknown>>;
}

class SessionError extends Error {
	readonly code: string;

	constructor({ name, code }: { name: string; code: string }) {
		super("boom");
		this.name = name;
		this.code = code;
	}
}

function createFakeRuntime() {
	const calls: Array<{ verb: string; input: unknown }> = [];
	const dispose = vi.fn();
	const constructedWith: unknown[] = [];
	class FakeSession {
		readonly options: unknown;

		static async open(options: unknown) {
			return new FakeSession(options);
		}

		constructor(options: unknown) {
			this.options = options;
			constructedWith.push(options);
		}

		async inspect({ input }: { input: unknown }) {
			calls.push({ verb: "inspect", input });
			return { outcome: "exact" };
		}

		async plan({ input }: { input: unknown }) {
			calls.push({ verb: "plan", input });
			return {
				plan: { planToken: "t" },
				cacheMetrics: {
					assetResolution: {
						schemaVersion: 1,
						fileProbeHits: 2,
						fileProbeMisses: 1,
					},
				},
				stageMetrics: {
					schemaVersion: 1,
					phase: "runtime-plan",
					measuredDurationMilliseconds: 5,
					stages: {
						"plan-persistence": {
							durationMilliseconds: 5,
							invocationCount: 1,
						},
					},
				},
			};
		}

		async commitWithMediaGrants({ input }: { input: unknown }) {
			calls.push({ verb: "commit", input });
			throw new SessionError({
				name: "ImportPlanConsumedError",
				code: "ignored",
			});
		}

		async readMediaPayloadChunk({ input }: { input: unknown }) {
			calls.push({ verb: "media-chunk", input });
			if (
				typeof input === "object" &&
				input !== null &&
				(input as { grantToken?: unknown }).grantToken === "expired"
			) {
				throw new SessionError({
					name: "MediaPayloadGrantError",
					code: "grant-expired",
				});
			}
			return {
				schemaVersion: 1,
				grantToken: "grant-token",
				offset: 0,
				bytes: new Uint8Array([1, 2]),
				eof: true,
			};
		}

		releaseMediaPayloadGrants({ input }: { input: unknown }) {
			calls.push({ verb: "media-release", input });
			return { releasedCount: 1 };
		}

		async readPendingDesktopImport(input: unknown) {
			calls.push({ verb: "inbox-read", input });
			return { bundle: {}, mediaGrants: [] };
		}

		dispose() {
			dispose();
		}
	}
	return {
		module: {
			JianyingDraftImportSession: FakeSession,
			listDesktopImports: async (input: unknown) => {
				calls.push({ verb: "inbox-list", input });
				return [{ entryId: "entry-1" }];
			},
			deleteDesktopImport: async (input: unknown) => {
				calls.push({ verb: "inbox-delete", input });
			},
		},
		calls,
		constructedWith,
		dispose,
	};
}

let context: ReturnType<typeof createMockWindowContext>;
let controller: JianyingDraftImportIPCController;
let runtime: ReturnType<typeof createFakeRuntime>;

beforeEach(() => {
	mockHandle.mockClear();
	mockRemoveHandler.mockClear();
	context = createMockWindowContext();
	runtime = createFakeRuntime();
	controller = setupJianyingDraftImportIPC({
		getMainWindow: () => context.mainWindow,
		loadRuntime: async () => runtime.module,
		getUserDataDirectory: () => "/qcut-user-data",
	});
});

describe("setupJianyingDraftImportIPC", () => {
	it("forwards inspect/plan to the runtime session with the build identity", async () => {
		const inspect = await getHandler({
			channel: JIANYING_IMPORT_INSPECT_CHANNEL,
		})(context.event, { draftPath: "/drafts/x" });
		expect(inspect).toMatchObject({ ok: true, value: { outcome: "exact" } });

		const plan = await getHandler({ channel: JIANYING_IMPORT_PLAN_CHANNEL })(
			context.event,
			{ draftPath: "/drafts/x" }
		);
		expect(plan.ok).toBe(true);
		expect(plan).toMatchObject({
			value: {
				cacheMetrics: {
					assetResolution: {
						schemaVersion: 1,
						fileProbeHits: 2,
						fileProbeMisses: 1,
					},
				},
				stageMetrics: {
					schemaVersion: 1,
					phase: "runtime-plan",
					measuredDurationMilliseconds: 5,
					stages: {
						"plan-persistence": {
							durationMilliseconds: 5,
							invocationCount: 1,
						},
					},
				},
			},
		});
		expect(runtime.calls.map((call) => call.verb)).toEqual(["inspect", "plan"]);
		expect(runtime.constructedWith[0]).toMatchObject({
			buildIdentity: {
				appVersion: "2026.08.04.1",
				interopSchemaVersion: 1,
			},
			storageDirectory: join("/qcut-user-data", "jianying-import", "plans"),
		});
	});

	it("chooses a draft directory only for the trusted main frame", async () => {
		mockShowOpenDialog.mockResolvedValue({
			canceled: false,
			filePaths: ["/drafts/x"],
		});
		const choose = getHandler({
			channel: JIANYING_IMPORT_CHOOSE_DIRECTORY_CHANNEL,
		});
		await expect(choose(context.event, undefined)).resolves.toEqual({
			ok: true,
			value: "/drafts/x",
		});
		await expect(choose(context.iframeEvent, undefined)).resolves.toMatchObject(
			{
				ok: false,
				error: { code: "untrusted-sender" },
			}
		);
		expect(mockShowOpenDialog).toHaveBeenCalledTimes(1);
	});

	it("maps typed runtime errors to stable codes, never throwing", async () => {
		const commit = await getHandler({
			channel: JIANYING_IMPORT_COMMIT_CHANNEL,
		})(context.event, { planToken: "t", acceptedWarningFingerprints: [] });
		expect(commit).toMatchObject({
			ok: false,
			error: { code: "plan-consumed" },
		});
	});

	it("lists, reads, and acknowledges the private desktop inbox", async () => {
		const list = await getHandler({
			channel: JIANYING_IMPORT_INBOX_LIST_CHANNEL,
		})(context.event, undefined);
		const read = await getHandler({
			channel: JIANYING_IMPORT_INBOX_READ_CHANNEL,
		})(context.event, { entryId: "entry-1" });
		const acknowledge = await getHandler({
			channel: JIANYING_IMPORT_INBOX_ACK_CHANNEL,
		})(context.event, { entryId: "entry-1" });
		expect(list).toMatchObject({ ok: true, value: [{ entryId: "entry-1" }] });
		expect(read).toMatchObject({
			ok: true,
			value: { bundle: {}, mediaGrants: [] },
		});
		expect(acknowledge).toEqual({ ok: true, value: { entryId: "entry-1" } });
		expect(runtime.calls).toEqual([
			{
				verb: "inbox-list",
				input: {
					inboxDirectory: join("/qcut-user-data", "jianying-import", "inbox"),
				},
			},
			{
				verb: "inbox-read",
				input: {
					inboxDirectory: join("/qcut-user-data", "jianying-import", "inbox"),
					entryId: "entry-1",
				},
			},
			{
				verb: "inbox-delete",
				input: {
					inboxDirectory: join("/qcut-user-data", "jianying-import", "inbox"),
					entryId: "entry-1",
				},
			},
		]);
	});

	it("serves and releases media grants only through the runtime session", async () => {
		const chunk = await getHandler({
			channel: JIANYING_IMPORT_MEDIA_CHUNK_CHANNEL,
		})(context.event, {
			grantToken: "grant-token",
			offset: 0,
			maxBytes: 1024,
		});
		const release = await getHandler({
			channel: JIANYING_IMPORT_MEDIA_RELEASE_CHANNEL,
		})(context.event, { grantTokens: ["grant-token"] });

		expect(chunk).toEqual({
			ok: true,
			value: {
				schemaVersion: 1,
				grantToken: "grant-token",
				offset: 0,
				bytes: new Uint8Array([1, 2]),
				eof: true,
			},
		});
		expect(release).toEqual({ ok: true, value: { releasedCount: 1 } });
		expect(runtime.calls).toEqual([
			{
				verb: "media-chunk",
				input: { grantToken: "grant-token", offset: 0, maxBytes: 1024 },
			},
			{
				verb: "media-release",
				input: { grantTokens: ["grant-token"] },
			},
		]);
	});

	it("maps media grant errors to their stable runtime code", async () => {
		const result = await getHandler({
			channel: JIANYING_IMPORT_MEDIA_CHUNK_CHANNEL,
		})(context.event, {
			grantToken: "expired",
			offset: 0,
			maxBytes: 1024,
		});
		expect(result).toMatchObject({
			ok: false,
			error: { code: "grant-expired" },
		});
	});

	it("rejects malformed inbox requests before filesystem access", async () => {
		const result = await getHandler({
			channel: JIANYING_IMPORT_INBOX_READ_CHANNEL,
		})(context.event, { entryId: "entry-1", extra: true });
		expect(result).toMatchObject({
			ok: false,
			error: { code: "invalid-request" },
		});
		expect(runtime.calls).toEqual([]);
	});

	it("refuses untrusted senders before touching the runtime", async () => {
		const result = await getHandler({
			channel: JIANYING_IMPORT_INSPECT_CHANNEL,
		})(context.iframeEvent, { draftPath: "/drafts/x" });
		expect(result).toMatchObject({
			ok: false,
			error: { code: "untrusted-sender" },
		});
		expect(runtime.calls).toEqual([]);
	});

	it("dispose removes channels and disposes the session", async () => {
		// Force session creation first.
		await getHandler({ channel: JIANYING_IMPORT_INSPECT_CHANNEL })(
			context.event,
			{ draftPath: "/drafts/x" }
		);
		controller.dispose();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(mockRemoveHandler.mock.calls.map((call) => call[0]).sort()).toEqual(
			[
				JIANYING_IMPORT_CHOOSE_DIRECTORY_CHANNEL,
				JIANYING_IMPORT_COMMIT_CHANNEL,
				JIANYING_IMPORT_INBOX_ACK_CHANNEL,
				JIANYING_IMPORT_INBOX_LIST_CHANNEL,
				JIANYING_IMPORT_INBOX_READ_CHANNEL,
				JIANYING_IMPORT_INSPECT_CHANNEL,
				JIANYING_IMPORT_MEDIA_CHUNK_CHANNEL,
				JIANYING_IMPORT_MEDIA_RELEASE_CHANNEL,
				JIANYING_IMPORT_PLAN_CHANNEL,
			].sort()
		);
		expect(runtime.dispose).toHaveBeenCalled();
	});
});
