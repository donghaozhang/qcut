import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ENVELOPE_DELETE_CHANNEL,
	ENVELOPE_PURGE_CHANNEL,
	ENVELOPE_READ_CHANNEL,
	ENVELOPE_ROTATE_CHANNEL,
	ENVELOPE_STATUS_CHANNEL,
	ENVELOPE_STORE_CHANNEL,
	type JianyingEnvelopeResultDto,
} from "../jianying-envelope-key-contract.js";

const { mockHandle, mockRemoveHandler } = vi.hoisted(() => ({
	mockHandle: vi.fn(),
	mockRemoveHandler: vi.fn(),
}));

vi.mock("electron", () => ({
	app: { getPath: vi.fn(() => "/unused") },
	ipcMain: { handle: mockHandle, removeHandler: mockRemoveHandler },
	safeStorage: {
		isEncryptionAvailable: vi.fn(() => true),
		encryptString: vi.fn(),
		decryptString: vi.fn(),
	},
}));

import {
	setupJianyingEnvelopeKeyIPC,
	type JianyingEnvelopeKeyIPCController,
} from "../jianying-envelope-key-handler.js";

/**
 * JYI-011 acceptance: key unavailable, rotation, delete, purge — and
 * plaintext never landing on disk.
 */

interface MockWindowContext {
	event: IpcMainInvokeEvent;
	iframeEvent: IpcMainInvokeEvent;
	mainWindow: BrowserWindow;
}

function createMockWindowContext(): MockWindowContext {
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
	) => Promise<JianyingEnvelopeResultDto<Record<string, unknown>>>;
}

/** Reversible fake "keychain": prefix marker + base64, key-version aware. */
function createFakeKeychain() {
	let wrapVersion = 1;
	return {
		available: true,
		brokenVersions: new Set<number>(),
		bumpWrapVersion() {
			wrapVersion += 1;
		},
		isEncryptionAvailable: () => true,
		encryptString: (plainText: string) =>
			Buffer.from(`wrapped:v${wrapVersion}:${plainText}`, "utf8"),
		decryptString(encrypted: Buffer) {
			const text = encrypted.toString("utf8");
			const match = /^wrapped:v(\d+):(.*)$/.exec(text);
			if (!match) throw new Error("not wrapped");
			if (this.brokenVersions.has(Number(match[1]))) {
				throw new Error("key material for this version is gone");
			}
			return match[2];
		},
	};
}

let userDataDirectory: string;
let controller: JianyingEnvelopeKeyIPCController | null = null;
let context: MockWindowContext;
let keychain: ReturnType<typeof createFakeKeychain>;
let keychainAvailable: boolean;

beforeEach(async () => {
	mockHandle.mockClear();
	mockRemoveHandler.mockClear();
	userDataDirectory = await mkdtemp(join(tmpdir(), "qcut-envelope-test-"));
	context = createMockWindowContext();
	keychain = createFakeKeychain();
	keychainAvailable = true;
	controller = setupJianyingEnvelopeKeyIPC({
		getMainWindow: () => context.mainWindow,
		getUserDataDirectory: () => userDataDirectory,
		isEncryptionAvailable: () => keychainAvailable,
		encryptString: (plainText) => keychain.encryptString(plainText),
		decryptString: (encrypted) => keychain.decryptString(encrypted),
		now: () => new Date(0),
	});
});

afterEach(async () => {
	controller?.dispose();
	controller = null;
	await rm(userDataDirectory, { recursive: true, force: true });
});

const PAYLOAD = Buffer.from("raw draft json with secrets 原始草稿", "utf8");

async function storeEnvelope({ importId = "import-1" } = {}) {
	return getHandler({ channel: ENVELOPE_STORE_CHANNEL })(context.event, {
		importId,
		payloadBase64: PAYLOAD.toString("base64"),
	});
}

describe("envelope store/read", () => {
	it("round-trips payload bytes without plaintext on disk", async () => {
		const stored = await storeEnvelope();
		expect(stored.ok).toBe(true);
		if (!stored.ok) return;
		expect(stored.value.cipher).toBe("os-keychain-wrapped");
		expect(stored.value.byteLength).toBe(PAYLOAD.length);

		// Nothing under userData contains the plaintext payload or raw key.
		const envelopeFile = await readFile(
			join(userDataDirectory, "jianying-import", "envelopes", "import-1.bin")
		);
		expect(envelopeFile.includes(PAYLOAD)).toBe(false);
		const keyStoreRaw = await readFile(
			join(userDataDirectory, "jianying-import", "envelope-keys.json"),
			"utf8"
		);
		expect(keyStoreRaw).not.toContain(PAYLOAD.toString("base64"));

		const read = await getHandler({ channel: ENVELOPE_READ_CHANNEL })(
			context.event,
			{ importId: "import-1" }
		);
		expect(read.ok).toBe(true);
		if (read.ok) {
			expect(
				Buffer.from(read.value.payloadBase64 as string, "base64").equals(
					PAYLOAD
				)
			).toBe(true);
		}
	});

	it("fails closed when the keychain is unavailable — nothing written", async () => {
		keychainAvailable = false;
		const stored = await storeEnvelope();
		expect(stored).toMatchObject({
			ok: false,
			error: { code: "keychain-unavailable" },
		});
		await expect(
			readdir(join(userDataDirectory, "jianying-import"))
		).rejects.toThrow();
	});

	it("reports missing envelopes and rejects malformed import ids", async () => {
		const missing = await getHandler({ channel: ENVELOPE_READ_CHANNEL })(
			context.event,
			{ importId: "nope" }
		);
		expect(missing).toMatchObject({
			ok: false,
			error: { code: "envelope-not-found" },
		});
		const invalid = await getHandler({ channel: ENVELOPE_READ_CHANNEL })(
			context.event,
			{ importId: "../escape" }
		);
		expect(invalid).toMatchObject({
			ok: false,
			error: { code: "invalid-request" },
		});
	});

	it("detects tampered ciphertext via GCM authentication", async () => {
		await storeEnvelope();
		const filePath = join(
			userDataDirectory,
			"jianying-import",
			"envelopes",
			"import-1.bin"
		);
		const blob = await readFile(filePath);
		blob[blob.length - 1] ^= 0xff;
		const { writeFile } = await import("node:fs/promises");
		await writeFile(filePath, blob);
		const read = await getHandler({ channel: ENVELOPE_READ_CHANNEL })(
			context.event,
			{ importId: "import-1" }
		);
		expect(read).toMatchObject({
			ok: false,
			error: { code: "envelope-corrupt" },
		});
	});

	it("refuses untrusted senders on every channel", async () => {
		for (const channel of [
			ENVELOPE_STORE_CHANNEL,
			ENVELOPE_READ_CHANNEL,
			ENVELOPE_DELETE_CHANNEL,
			ENVELOPE_PURGE_CHANNEL,
			ENVELOPE_ROTATE_CHANNEL,
			ENVELOPE_STATUS_CHANNEL,
		]) {
			const result = await getHandler({ channel })(context.iframeEvent, {
				importId: "import-1",
				payloadBase64: "aGk=",
			});
			expect(result).toMatchObject({
				ok: false,
				error: { code: "untrusted-sender" },
			});
		}
	});
});

describe("delete and purge", () => {
	it("deletes a single envelope: key entry and payload file", async () => {
		await storeEnvelope();
		const deleted = await getHandler({ channel: ENVELOPE_DELETE_CHANNEL })(
			context.event,
			{ importId: "import-1" }
		);
		expect(deleted).toMatchObject({ ok: true, value: { deleted: true } });
		const read = await getHandler({ channel: ENVELOPE_READ_CHANNEL })(
			context.event,
			{ importId: "import-1" }
		);
		expect(read).toMatchObject({
			ok: false,
			error: { code: "envelope-not-found" },
		});
		const files = await readdir(
			join(userDataDirectory, "jianying-import", "envelopes")
		);
		expect(files).toEqual([]);
	});

	it("purges every envelope and the key store", async () => {
		await storeEnvelope({ importId: "import-1" });
		await storeEnvelope({ importId: "import-2" });
		const purged = await getHandler({ channel: ENVELOPE_PURGE_CHANNEL })(
			context.event,
			undefined
		);
		expect(purged).toMatchObject({ ok: true, value: { purgedCount: 2 } });
		await expect(
			readdir(join(userDataDirectory, "jianying-import"))
		).rejects.toThrow();
	});
});

describe("rotation", () => {
	it("re-wraps every key under a new version; reads keep working", async () => {
		await storeEnvelope();
		keychain.bumpWrapVersion();
		const rotated = await getHandler({ channel: ENVELOPE_ROTATE_CHANNEL })(
			context.event,
			undefined
		);
		expect(rotated).toMatchObject({
			ok: true,
			value: { keyVersion: 2, rotatedCount: 1, droppedImportIds: [] },
		});
		const read = await getHandler({ channel: ENVELOPE_READ_CHANNEL })(
			context.event,
			{ importId: "import-1" }
		);
		expect(read.ok).toBe(true);
		if (read.ok) {
			expect(read.value.keyVersion).toBe(2);
		}
	});

	it("drops envelopes whose keys no longer unwrap, fail-closed", async () => {
		await storeEnvelope();
		// Simulate lost key material for everything wrapped under v1.
		keychain.brokenVersions.add(1);
		keychain.bumpWrapVersion();
		const rotated = await getHandler({ channel: ENVELOPE_ROTATE_CHANNEL })(
			context.event,
			undefined
		);
		expect(rotated).toMatchObject({
			ok: true,
			value: { rotatedCount: 0, droppedImportIds: ["import-1"] },
		});
		const files = await readdir(
			join(userDataDirectory, "jianying-import", "envelopes")
		);
		expect(files).toEqual([]);
	});
});

describe("status and dispose", () => {
	it("reports keychain availability and stored count", async () => {
		await storeEnvelope();
		const status = await getHandler({ channel: ENVELOPE_STATUS_CHANNEL })(
			context.event,
			undefined
		);
		expect(status).toMatchObject({
			ok: true,
			value: { keychainAvailable: true, keyVersion: 1, storedCount: 1 },
		});
	});

	it("dispose removes every channel", () => {
		controller?.dispose();
		controller = null;
		expect(mockRemoveHandler.mock.calls.map((call) => call[0]).sort()).toEqual(
			[
				ENVELOPE_DELETE_CHANNEL,
				ENVELOPE_PURGE_CHANNEL,
				ENVELOPE_READ_CHANNEL,
				ENVELOPE_ROTATE_CHANNEL,
				ENVELOPE_STATUS_CHANNEL,
				ENVELOPE_STORE_CHANNEL,
			].sort()
		);
	});
});
