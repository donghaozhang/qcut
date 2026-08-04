/**
 * Envelope key service handler (JYI-011).
 *
 * Main-process-only custody of foreign draft payload bytes:
 *
 *   payload --AES-256-GCM--> userData/jianying-import/envelopes/<id>.bin
 *   data key --safeStorage (OS keychain)--> envelope-keys.json (0o600)
 *
 * Fail-closed everywhere: no keychain → no store (plaintext never lands on
 * disk), GCM auth failure → envelope-corrupt, rotation drops any entry
 * whose key no longer unwraps instead of carrying it forward blind.
 */

import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";
import {
	mkdir,
	readdir,
	readFile,
	rm,
	unlink,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
	app,
	type BrowserWindow,
	type IpcMainInvokeEvent,
	ipcMain,
	safeStorage,
} from "electron";
import {
	ENVELOPE_DELETE_CHANNEL,
	ENVELOPE_PURGE_CHANNEL,
	ENVELOPE_READ_CHANNEL,
	ENVELOPE_ROTATE_CHANNEL,
	ENVELOPE_STATUS_CHANNEL,
	ENVELOPE_STORE_CHANNEL,
	type EnvelopeDeleteResultDto,
	type EnvelopePurgeResultDto,
	type EnvelopeReadResultDto,
	type EnvelopeRotateResultDto,
	type EnvelopeStatusResultDto,
	type EnvelopeStoreResultDto,
	type JianyingEnvelopeErrorCode,
	type JianyingEnvelopeResultDto,
} from "./jianying-envelope-key-contract.js";

const IMPORT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_PAYLOAD_BYTES = 256 * 1024 * 1024;
const ENVELOPE_DIRECTORY_NAME = "jianying-import";
const ENVELOPES_SUBDIRECTORY = "envelopes";
const KEY_STORE_FILE_NAME = "envelope-keys.json";
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

class EnvelopeServiceError extends Error {
	readonly code: JianyingEnvelopeErrorCode;

	constructor({
		code,
		message,
	}: {
		code: JianyingEnvelopeErrorCode;
		message: string;
	}) {
		super(message);
		this.name = "EnvelopeServiceError";
		this.code = code;
	}
}

interface KeyStoreEntryV1 {
	wrappedKeyBase64: string;
	keyVersion: number;
	byteLength: number;
	sha256: string;
	createdAtIso: string;
}

interface KeyStoreV1 {
	schemaVersion: 1;
	keyVersion: number;
	entries: Record<string, KeyStoreEntryV1>;
}

export interface JianyingEnvelopeKeyIPCController {
	dispose: () => void;
}

export interface SetupJianyingEnvelopeKeyIPCOptions {
	getMainWindow: () => BrowserWindow | null;
	getUserDataDirectory?: () => string;
	isEncryptionAvailable?: () => boolean;
	encryptString?: (plainText: string) => Buffer;
	decryptString?: (encrypted: Buffer) => string;
	now?: () => Date;
}

class UntrustedEnvelopeSenderError extends EnvelopeServiceError {
	constructor() {
		super({
			code: "untrusted-sender",
			message: "Envelope channel caller is not the trusted main frame.",
		});
	}
}

function assertTrustedMainFrame({
	event,
	mainWindow,
}: {
	event: IpcMainInvokeEvent;
	mainWindow: BrowserWindow | null;
}): void {
	if (
		!mainWindow ||
		mainWindow.isDestroyed() ||
		mainWindow.webContents.isDestroyed() ||
		event.sender !== mainWindow.webContents ||
		event.senderFrame === null ||
		event.senderFrame !== mainWindow.webContents.mainFrame
	) {
		throw new UntrustedEnvelopeSenderError();
	}
}

function toErrorDto({ error }: { error: unknown }): {
	code: JianyingEnvelopeErrorCode;
	name: string;
	message: string;
} {
	if (error instanceof EnvelopeServiceError) {
		return {
			code: error.code,
			name: error.name,
			message: error.message.slice(0, 16_384),
		};
	}
	const name = error instanceof Error ? error.name : "Error";
	const message = error instanceof Error ? error.message : String(error);
	return {
		code: "envelope-io-failed",
		name: name.slice(0, 256),
		message: message.slice(0, 16_384),
	};
}

function requireImportId({ value }: { value: unknown }): string {
	if (
		typeof value !== "object" ||
		value === null ||
		typeof (value as { importId?: unknown }).importId !== "string" ||
		!IMPORT_ID_PATTERN.test((value as { importId: string }).importId)
	) {
		throw new EnvelopeServiceError({
			code: "invalid-request",
			message: "importId must match [A-Za-z0-9_-]{1,128}",
		});
	}
	return (value as { importId: string }).importId;
}

export function setupJianyingEnvelopeKeyIPC({
	getMainWindow,
	getUserDataDirectory = () => app.getPath("userData"),
	isEncryptionAvailable = () => safeStorage.isEncryptionAvailable(),
	encryptString = (plainText) => safeStorage.encryptString(plainText),
	decryptString = (encrypted) => safeStorage.decryptString(encrypted),
	now = () => new Date(),
}: SetupJianyingEnvelopeKeyIPCOptions): JianyingEnvelopeKeyIPCController {
	const rootDirectory = () =>
		join(getUserDataDirectory(), ENVELOPE_DIRECTORY_NAME);
	const envelopesDirectory = () =>
		join(rootDirectory(), ENVELOPES_SUBDIRECTORY);
	const keyStorePath = () => join(rootDirectory(), KEY_STORE_FILE_NAME);

	async function loadKeyStore(): Promise<KeyStoreV1> {
		try {
			const raw = await readFile(keyStorePath(), "utf8");
			const parsed = JSON.parse(raw) as KeyStoreV1;
			if (parsed.schemaVersion !== 1 || typeof parsed.entries !== "object") {
				throw new Error("unexpected key store shape");
			}
			return parsed;
		} catch {
			return { schemaVersion: 1, keyVersion: 1, entries: {} };
		}
	}

	async function saveKeyStore({ store }: { store: KeyStoreV1 }): Promise<void> {
		await mkdir(rootDirectory(), { recursive: true, mode: 0o700 });
		await writeFile(keyStorePath(), JSON.stringify(store), { mode: 0o600 });
	}

	function requireKeychain(): void {
		if (!isEncryptionAvailable()) {
			throw new EnvelopeServiceError({
				code: "keychain-unavailable",
				message:
					"OS keychain encryption is unavailable; refusing to store plaintext",
			});
		}
	}

	async function handleStore({
		input,
	}: {
		input: unknown;
	}): Promise<EnvelopeStoreResultDto> {
		const importId = requireImportId({ value: input });
		const payloadBase64 = (input as { payloadBase64?: unknown }).payloadBase64;
		if (typeof payloadBase64 !== "string" || payloadBase64.length === 0) {
			throw new EnvelopeServiceError({
				code: "invalid-request",
				message: "payloadBase64 must be a non-empty string",
			});
		}
		requireKeychain();
		const payload = Buffer.from(payloadBase64, "base64");
		if (payload.length === 0 || payload.length > MAX_PAYLOAD_BYTES) {
			throw new EnvelopeServiceError({
				code: "invalid-request",
				message: `payload must decode to 1..${MAX_PAYLOAD_BYTES} bytes`,
			});
		}

		const dataKey = randomBytes(32);
		const iv = randomBytes(GCM_IV_BYTES);
		const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
		const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
		const authTag = cipher.getAuthTag();

		await mkdir(envelopesDirectory(), { recursive: true, mode: 0o700 });
		const fileName = `${importId}.bin`;
		const location = join(
			ENVELOPE_DIRECTORY_NAME,
			ENVELOPES_SUBDIRECTORY,
			fileName
		);
		await writeFile(
			join(envelopesDirectory(), fileName),
			Buffer.concat([iv, authTag, ciphertext]),
			{ mode: 0o600 }
		);

		const store = await loadKeyStore();
		store.entries[importId] = {
			wrappedKeyBase64: encryptString(dataKey.toString("base64")).toString(
				"base64"
			),
			keyVersion: store.keyVersion,
			byteLength: payload.length,
			sha256: createHash("sha256").update(payload).digest("hex"),
			createdAtIso: now().toISOString(),
		};
		await saveKeyStore({ store });

		return {
			importId,
			keyVersion: store.keyVersion,
			cipher: "os-keychain-wrapped",
			location,
			byteLength: payload.length,
			sha256: store.entries[importId].sha256,
		};
	}

	async function unwrapDataKey({
		entry,
	}: {
		entry: KeyStoreEntryV1;
	}): Promise<Buffer> {
		try {
			const dataKeyBase64 = decryptString(
				Buffer.from(entry.wrappedKeyBase64, "base64")
			);
			const dataKey = Buffer.from(dataKeyBase64, "base64");
			if (dataKey.length !== 32) {
				throw new Error("unwrapped key has the wrong length");
			}
			return dataKey;
		} catch {
			throw new EnvelopeServiceError({
				code: "envelope-corrupt",
				message: "stored data key could not be unwrapped",
			});
		}
	}

	async function handleRead({
		input,
	}: {
		input: unknown;
	}): Promise<EnvelopeReadResultDto> {
		const importId = requireImportId({ value: input });
		requireKeychain();
		const store = await loadKeyStore();
		const entry = store.entries[importId];
		if (entry === undefined) {
			throw new EnvelopeServiceError({
				code: "envelope-not-found",
				message: "no envelope is stored under this import id",
			});
		}
		let blob: Buffer;
		try {
			blob = await readFile(join(envelopesDirectory(), `${importId}.bin`));
		} catch {
			throw new EnvelopeServiceError({
				code: "envelope-not-found",
				message: "envelope payload file is missing",
			});
		}
		if (blob.length < GCM_IV_BYTES + GCM_TAG_BYTES + 1) {
			throw new EnvelopeServiceError({
				code: "envelope-corrupt",
				message: "envelope payload file is truncated",
			});
		}
		const dataKey = await unwrapDataKey({ entry });
		const iv = blob.subarray(0, GCM_IV_BYTES);
		const authTag = blob.subarray(GCM_IV_BYTES, GCM_IV_BYTES + GCM_TAG_BYTES);
		const ciphertext = blob.subarray(GCM_IV_BYTES + GCM_TAG_BYTES);
		try {
			const decipher = createDecipheriv("aes-256-gcm", dataKey, iv);
			decipher.setAuthTag(authTag);
			const payload = Buffer.concat([
				decipher.update(ciphertext),
				decipher.final(),
			]);
			return {
				importId,
				payloadBase64: payload.toString("base64"),
				keyVersion: entry.keyVersion,
			};
		} catch {
			throw new EnvelopeServiceError({
				code: "envelope-corrupt",
				message: "envelope payload failed authentication",
			});
		}
	}

	async function handleDelete({
		input,
	}: {
		input: unknown;
	}): Promise<EnvelopeDeleteResultDto> {
		const importId = requireImportId({ value: input });
		const store = await loadKeyStore();
		const existed = store.entries[importId] !== undefined;
		delete store.entries[importId];
		await saveKeyStore({ store });
		await unlink(join(envelopesDirectory(), `${importId}.bin`)).catch(
			() => undefined
		);
		return { deleted: existed };
	}

	async function handlePurge(): Promise<EnvelopePurgeResultDto> {
		const store = await loadKeyStore();
		const purgedCount = Object.keys(store.entries).length;
		await rm(rootDirectory(), { recursive: true, force: true });
		return { purgedCount };
	}

	async function handleRotate(): Promise<EnvelopeRotateResultDto> {
		requireKeychain();
		const store = await loadKeyStore();
		const nextVersion = store.keyVersion + 1;
		const droppedImportIds: string[] = [];
		let rotatedCount = 0;
		for (const [importId, entry] of Object.entries(store.entries)) {
			try {
				const dataKey = await unwrapDataKey({ entry });
				store.entries[importId] = {
					...entry,
					wrappedKeyBase64: encryptString(dataKey.toString("base64")).toString(
						"base64"
					),
					keyVersion: nextVersion,
				};
				rotatedCount += 1;
			} catch {
				// Fail closed: an entry we cannot re-wrap is dropped, never kept.
				delete store.entries[importId];
				droppedImportIds.push(importId);
				await unlink(join(envelopesDirectory(), `${importId}.bin`)).catch(
					() => undefined
				);
			}
		}
		store.keyVersion = nextVersion;
		await saveKeyStore({ store });
		return { keyVersion: nextVersion, rotatedCount, droppedImportIds };
	}

	async function handleStatus(): Promise<EnvelopeStatusResultDto> {
		const store = await loadKeyStore();
		let storedCount = 0;
		try {
			const files = await readdir(envelopesDirectory());
			storedCount = files.filter((name) => name.endsWith(".bin")).length;
		} catch {
			storedCount = 0;
		}
		return {
			keychainAvailable: isEncryptionAvailable(),
			keyVersion: store.keyVersion,
			storedCount,
		};
	}

	function register<Value>({
		channel,
		handle,
	}: {
		channel: string;
		handle: ({ input }: { input: unknown }) => Promise<Value>;
	}): void {
		ipcMain.handle(
			channel,
			async (
				event: IpcMainInvokeEvent,
				input: unknown
			): Promise<JianyingEnvelopeResultDto<Value>> => {
				try {
					assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
					return { ok: true, value: await handle({ input }) };
				} catch (error) {
					return { ok: false, error: toErrorDto({ error }) };
				}
			}
		);
	}

	register({ channel: ENVELOPE_STORE_CHANNEL, handle: handleStore });
	register({ channel: ENVELOPE_READ_CHANNEL, handle: handleRead });
	register({ channel: ENVELOPE_DELETE_CHANNEL, handle: handleDelete });
	register({ channel: ENVELOPE_PURGE_CHANNEL, handle: () => handlePurge() });
	register({ channel: ENVELOPE_ROTATE_CHANNEL, handle: () => handleRotate() });
	register({ channel: ENVELOPE_STATUS_CHANNEL, handle: () => handleStatus() });

	return {
		dispose: () => {
			for (const channel of [
				ENVELOPE_STORE_CHANNEL,
				ENVELOPE_READ_CHANNEL,
				ENVELOPE_DELETE_CHANNEL,
				ENVELOPE_PURGE_CHANNEL,
				ENVELOPE_ROTATE_CHANNEL,
				ENVELOPE_STATUS_CHANNEL,
			]) {
				ipcMain.removeHandler(channel);
			}
		},
	};
}
