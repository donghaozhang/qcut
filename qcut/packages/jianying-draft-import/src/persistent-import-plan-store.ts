import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
	parseImportPlanArtifactV1,
	type ImportPlanArtifactV1,
	type ImportPlanBuildIdentity,
} from "./import-plan-artifact.js";
import {
	IMPORT_PLAN_STORE_STATE_SCHEMA_VERSION,
	ImportPlanBuildMismatchError,
	ImportPlanExpiredError,
	ImportPlanStore,
	type ImportPlanStoreStateEntry,
	type ImportPlanStoreStateV1,
} from "./import-plan-store.js";

const STORE_FILE_NAME = "import-plans.v1.json";
const MAX_STORE_FILE_BYTES = 4 * 1024 * 1024;
const CORRUPT_STORE_FILE_PREFIX = `${STORE_FILE_NAME}.corrupt.`;

export type PersistentImportPlanStoreStartupRecovery =
	| "none"
	| "quarantined-corrupt-store";

export class PersistentImportPlanStoreCorruptError extends Error {
	constructor({ cause }: { cause?: unknown } = {}) {
		super("Persistent import plan store is corrupt.", { cause });
		this.name = "PersistentImportPlanStoreCorruptError";
	}
}

export class PersistentImportPlanStoreUnavailableError extends Error {
	constructor() {
		super("Persistent import plan store is unavailable.");
		this.name = "PersistentImportPlanStoreUnavailableError";
	}
}

function asRecord({ value }: { value: unknown }): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new PersistentImportPlanStoreCorruptError();
	}
	return value as Record<string, unknown>;
}

function assertExactKeys({
	record,
	keys,
}: {
	record: Record<string, unknown>;
	keys: readonly string[];
}): void {
	if (
		Object.keys(record).length !== keys.length ||
		keys.some((key) => !(key in record))
	) {
		throw new PersistentImportPlanStoreCorruptError();
	}
}

function parseStoreState({
	value,
}: {
	value: unknown;
}): ImportPlanStoreStateV1 {
	try {
		const record = asRecord({ value });
		assertExactKeys({ record, keys: ["schemaVersion", "entries"] });
		if (
			record.schemaVersion !== IMPORT_PLAN_STORE_STATE_SCHEMA_VERSION ||
			!Array.isArray(record.entries)
		) {
			throw new PersistentImportPlanStoreCorruptError();
		}
		const entries = record.entries.map((value) => {
			const entry = asRecord({ value });
			assertExactKeys({ record: entry, keys: ["artifact", "status"] });
			const status = entry.status;
			if (status !== "ready" && status !== "consumed") {
				throw new PersistentImportPlanStoreCorruptError();
			}
			const parsedStatus: ImportPlanStoreStateEntry["status"] = status;
			return {
				artifact: parseImportPlanArtifactV1(entry.artifact),
				status: parsedStatus,
			};
		});
		return {
			schemaVersion: IMPORT_PLAN_STORE_STATE_SCHEMA_VERSION,
			entries,
		};
	} catch (error) {
		if (error instanceof PersistentImportPlanStoreCorruptError) {
			throw error;
		}
		throw new PersistentImportPlanStoreCorruptError({ cause: error });
	}
}

async function ensurePrivateDirectory({
	storageDirectory,
}: {
	storageDirectory: string;
}): Promise<void> {
	if (
		!isAbsolute(storageDirectory) ||
		storageDirectory.includes("\0") ||
		storageDirectory.length > 16_384
	) {
		throw new PersistentImportPlanStoreUnavailableError();
	}
	await mkdir(storageDirectory, { recursive: true, mode: 0o700 });
	const metadata = await lstat(storageDirectory);
	if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
		throw new PersistentImportPlanStoreUnavailableError();
	}
	await chmod(storageDirectory, 0o700);
}

async function readStoreState({
	storePath,
}: {
	storePath: string;
}): Promise<ImportPlanStoreStateV1 | undefined> {
	const noFollowFlag = constants.O_NOFOLLOW ?? 0;
	let handle;
	try {
		handle = await open(storePath, constants.O_RDONLY | noFollowFlag);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return undefined;
		}
		throw new PersistentImportPlanStoreUnavailableError();
	}
	try {
		const metadata = await handle.stat();
		if (!metadata.isFile() || metadata.nlink !== 1) {
			throw new PersistentImportPlanStoreUnavailableError();
		}
		if (metadata.size > MAX_STORE_FILE_BYTES) {
			throw new PersistentImportPlanStoreCorruptError();
		}
		await handle.chmod(0o600);
		const serialized = await handle.readFile("utf8");
		return parseStoreState({ value: JSON.parse(serialized) });
	} catch (error) {
		if (
			error instanceof PersistentImportPlanStoreCorruptError ||
			error instanceof PersistentImportPlanStoreUnavailableError
		) {
			throw error;
		}
		throw new PersistentImportPlanStoreCorruptError();
	} finally {
		await handle.close().catch(() => undefined);
	}
}

async function quarantineCorruptStore({
	storageDirectory,
	storePath,
}: {
	storageDirectory: string;
	storePath: string;
}): Promise<void> {
	const quarantinePath = join(
		storageDirectory,
		`${CORRUPT_STORE_FILE_PREFIX}${randomUUID()}.json`
	);
	try {
		await rename(storePath, quarantinePath);
		await chmod(quarantinePath, 0o600);
		await syncDirectoryBestEffort({ storageDirectory });
	} catch {
		throw new PersistentImportPlanStoreUnavailableError();
	}
}

async function syncDirectoryBestEffort({
	storageDirectory,
}: {
	storageDirectory: string;
}): Promise<void> {
	let handle;
	try {
		handle = await open(storageDirectory, constants.O_RDONLY);
		await handle.sync();
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (!["EINVAL", "ENOTSUP", "EPERM", "EISDIR"].includes(code ?? "")) {
			throw error;
		}
	} finally {
		await handle?.close().catch(() => undefined);
	}
}

async function writeStoreState({
	state,
	storageDirectory,
	storePath,
}: {
	state: ImportPlanStoreStateV1;
	storageDirectory: string;
	storePath: string;
}): Promise<void> {
	const serialized = JSON.stringify(state);
	if (Buffer.byteLength(serialized, "utf8") > MAX_STORE_FILE_BYTES) {
		throw new PersistentImportPlanStoreUnavailableError();
	}
	const temporaryPath = join(
		storageDirectory,
		`.${STORE_FILE_NAME}.${randomUUID()}.tmp`
	);
	let handle;
	try {
		handle = await open(temporaryPath, "wx", 0o600);
		await handle.writeFile(serialized, "utf8");
		await handle.sync();
		await handle.close();
		handle = undefined;
		await rename(temporaryPath, storePath);
		await chmod(storePath, 0o600);
		await syncDirectoryBestEffort({ storageDirectory });
	} finally {
		await handle?.close().catch(() => undefined);
		await rm(temporaryPath, { force: true }).catch(() => undefined);
	}
}

export class PersistentImportPlanStore {
	readonly startupRecoveryAction: PersistentImportPlanStoreStartupRecovery;
	readonly #buildIdentity: ImportPlanBuildIdentity;
	readonly #maxStoredPlans: number | undefined;
	readonly #now: () => number;
	readonly #storageDirectory: string;
	readonly #storePath: string;
	#store: ImportPlanStore;
	#operationTail: Promise<void> = Promise.resolve();
	#unavailable = false;

	private constructor({
		buildIdentity,
		maxStoredPlans,
		now,
		startupRecoveryAction,
		storageDirectory,
		store,
	}: {
		buildIdentity: ImportPlanBuildIdentity;
		maxStoredPlans?: number;
		now: () => number;
		startupRecoveryAction: PersistentImportPlanStoreStartupRecovery;
		storageDirectory: string;
		store: ImportPlanStore;
	}) {
		this.startupRecoveryAction = startupRecoveryAction;
		this.#buildIdentity = { ...buildIdentity };
		this.#maxStoredPlans = maxStoredPlans;
		this.#now = now;
		this.#storageDirectory = storageDirectory;
		this.#storePath = join(storageDirectory, STORE_FILE_NAME);
		this.#store = store;
	}

	static async open({
		buildIdentity,
		maxStoredPlans,
		now = Date.now,
		storageDirectory,
	}: {
		buildIdentity: ImportPlanBuildIdentity;
		maxStoredPlans?: number;
		now?: () => number;
		storageDirectory: string;
	}): Promise<PersistentImportPlanStore> {
		await ensurePrivateDirectory({ storageDirectory });
		const storePath = join(storageDirectory, STORE_FILE_NAME);
		let startupRecoveryAction: PersistentImportPlanStoreStartupRecovery =
			"none";
		let state: ImportPlanStoreStateV1 | undefined;
		try {
			state = await readStoreState({ storePath });
		} catch (error) {
			if (!(error instanceof PersistentImportPlanStoreCorruptError)) {
				throw error;
			}
			await quarantineCorruptStore({ storageDirectory, storePath });
			startupRecoveryAction = "quarantined-corrupt-store";
		}
		const store = new ImportPlanStore({
			buildIdentity,
			now,
			...(maxStoredPlans === undefined ? {} : { maxStoredPlans }),
			...(state === undefined ? {} : { initialState: state }),
		});
		const instance = new PersistentImportPlanStore({
			buildIdentity,
			...(maxStoredPlans === undefined ? {} : { maxStoredPlans }),
			now,
			startupRecoveryAction,
			storageDirectory,
			store,
		});
		if (state !== undefined) {
			await instance.#pruneInvalidOnOpen({ state });
		}
		return instance;
	}

	#createCandidate(): ImportPlanStore {
		return new ImportPlanStore({
			buildIdentity: this.#buildIdentity,
			now: this.#now,
			...(this.#maxStoredPlans === undefined
				? {}
				: { maxStoredPlans: this.#maxStoredPlans }),
			initialState: this.#store.exportState(),
		});
	}

	async #pruneInvalidOnOpen({ state }: { state: ImportPlanStoreStateV1 }) {
		for (const entry of state.entries) {
			try {
				this.#store.get({ planToken: entry.artifact.planToken });
			} catch (error) {
				if (
					!(error instanceof ImportPlanExpiredError) &&
					!(error instanceof ImportPlanBuildMismatchError)
				) {
					throw error;
				}
			}
		}
		if (this.#store.exportState().entries.length !== state.entries.length) {
			await writeStoreState({
				state: this.#store.exportState(),
				storageDirectory: this.#storageDirectory,
				storePath: this.#storePath,
			});
		}
	}

	#runExclusive<T>({ operation }: { operation: () => Promise<T> }): Promise<T> {
		const result = this.#operationTail.then(operation, operation);
		this.#operationTail = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	async #persistCandidate({ candidate }: { candidate: ImportPlanStore }) {
		if (this.#unavailable) {
			throw new PersistentImportPlanStoreUnavailableError();
		}
		try {
			await writeStoreState({
				state: candidate.exportState(),
				storageDirectory: this.#storageDirectory,
				storePath: this.#storePath,
			});
			this.#store = candidate;
		} catch {
			this.#unavailable = true;
			throw new PersistentImportPlanStoreUnavailableError();
		}
	}

	put({ artifact }: { artifact: ImportPlanArtifactV1 }): Promise<void> {
		return this.#runExclusive({
			operation: async () => {
				const candidate = this.#createCandidate();
				candidate.put({ artifact });
				await this.#persistCandidate({ candidate });
			},
		});
	}

	get({ planToken }: { planToken: string }): Promise<ImportPlanArtifactV1> {
		return this.#runExclusive({
			operation: async () => {
				const candidate = this.#createCandidate();
				let artifact: ImportPlanArtifactV1;
				try {
					artifact = candidate.get({ planToken });
				} catch (error) {
					await this.#persistCandidate({ candidate });
					throw error;
				}
				await this.#persistCandidate({ candidate });
				return artifact;
			},
		});
	}

	consume({ planToken }: { planToken: string }): Promise<ImportPlanArtifactV1> {
		return this.#runExclusive({
			operation: async () => {
				const candidate = this.#createCandidate();
				let artifact: ImportPlanArtifactV1;
				try {
					artifact = candidate.consume({ planToken });
				} catch (error) {
					await this.#persistCandidate({ candidate });
					throw error;
				}
				await this.#persistCandidate({ candidate });
				return artifact;
			},
		});
	}

	getSize(): Promise<number> {
		return this.#runExclusive({
			operation: async () => {
				const candidate = this.#createCandidate();
				const size = candidate.size;
				await this.#persistCandidate({ candidate });
				return size;
			},
		});
	}

	clear(): Promise<void> {
		return this.#runExclusive({
			operation: async () => {
				const candidate = new ImportPlanStore({
					buildIdentity: this.#buildIdentity,
					now: this.#now,
					...(this.#maxStoredPlans === undefined
						? {}
						: { maxStoredPlans: this.#maxStoredPlans }),
				});
				await this.#persistCandidate({ candidate });
			},
		});
	}
}
