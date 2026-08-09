import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	DraftInteropDocumentV1,
	InteropIssue,
} from "@qcut/editor-core/draft-interop";
import { afterEach, describe, expect, it } from "vitest";
import {
	createImportPlanArtifact,
	ImportPlanArtifactMalformedError,
	parseImportPlanArtifactV1,
	type ImportPlanArtifactV1,
	type ImportPlanBuildIdentity,
} from "../import-plan-artifact.js";
import {
	ImportPlanConsumedError,
	ImportPlanNotFoundError,
} from "../import-plan-store.js";
import {
	PersistentImportPlanStore,
	PersistentImportPlanStoreUnavailableError,
} from "../persistent-import-plan-store.js";
import type { DraftSourceSnapshot } from "../snapshot-reader.js";

const BUILD: ImportPlanBuildIdentity = {
	appVersion: "2026.08.04.1",
	interopSchemaVersion: 1,
};
const NOW = 1_000_000;
const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "qcut-import-plan-store-"));
	temporaryDirectories.push(directory);
	return directory;
}

function createArtifact({
	planToken = "persistent-token",
	now = NOW,
	ttl = 60_000,
	issues = [],
}: {
	planToken?: string;
	now?: number;
	ttl?: number;
	issues?: InteropIssue[];
} = {}): ImportPlanArtifactV1 {
	const snapshot: DraftSourceSnapshot = {
		rootRealPath: "/private/qcut/source-draft",
		files: [
			{
				relativePath: "draft_info.json",
				byteLength: 128,
				sha256: "a".repeat(64),
				role: "content",
				classification: "plaintext-json",
				identity: {
					device: "1",
					inode: "42",
					size: "128",
					mtimeNanoseconds: "1000",
				},
			},
		],
		parsedJsonByPath: {},
		issues: [],
	};
	const document: DraftInteropDocumentV1 = {
		schemaVersion: 1,
		timeUnit: "microseconds",
		source: {
			product: "capcut",
			profileId: "capcut-desktop-8.1",
			platform: "macos",
			files: [],
		},
		project: {
			id: "project",
			name: "Project",
			width: 1920,
			height: 1080,
			fps: 30,
		},
		timelines: [],
		resources: [],
		links: [],
		issues,
	};
	return createImportPlanArtifact({
		snapshot,
		document,
		detectionOutcome: "exact",
		profileId: "capcut-desktop-8.1",
		buildIdentity: BUILD,
		nowUnixMilliseconds: now,
		planTtlMilliseconds: ttl,
		planToken,
	});
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("parseImportPlanArtifactV1", () => {
	it("accepts the canonical persisted artifact", () => {
		const artifact = createArtifact();
		expect(
			parseImportPlanArtifactV1(JSON.parse(JSON.stringify(artifact)))
		).toEqual(artifact);
	});

	it("persists hashed warning and blocker fingerprints", () => {
		const artifact = createArtifact({
			issues: [
				{
					code: "FEATURE_DOWNGRADED",
					severity: "warning",
					message: "text downgraded",
					subjectId: "segment-1",
				},
				{
					code: "RESOURCE_MISSING",
					severity: "error",
					message: "media missing",
					subjectId: "resource-1",
				},
			],
		});
		expect(artifact.warningFingerprints[0]).toMatch(/^[a-f0-9]{64}$/u);
		expect(artifact.blockerFingerprints[0]).toMatch(/^[a-f0-9]{64}$/u);
		expect(
			parseImportPlanArtifactV1(JSON.parse(JSON.stringify(artifact)))
		).toEqual(artifact);
	});

	it("rejects unknown fields, unsafe paths, and inconsistent commit state", () => {
		const artifact = createArtifact();
		expect(() =>
			parseImportPlanArtifactV1({ ...artifact, unexpected: true })
		).toThrow(ImportPlanArtifactMalformedError);
		expect(() =>
			parseImportPlanArtifactV1({
				...artifact,
				sourceFiles: [
					{ ...artifact.sourceFiles[0], relativePath: "../draft_info.json" },
				],
			})
		).toThrow(ImportPlanArtifactMalformedError);
		expect(() =>
			parseImportPlanArtifactV1({ ...artifact, canCommit: false })
		).toThrow(ImportPlanArtifactMalformedError);
	});
});

describe("PersistentImportPlanStore", () => {
	it("persists ready plans across process-style reopen", async () => {
		const storageDirectory = await createTemporaryDirectory();
		const first = await PersistentImportPlanStore.open({
			buildIdentity: BUILD,
			storageDirectory,
			now: () => NOW,
		});
		await first.put({ artifact: createArtifact() });

		const reopened = await PersistentImportPlanStore.open({
			buildIdentity: BUILD,
			storageDirectory,
			now: () => NOW,
		});
		expect(
			(await reopened.get({ planToken: "persistent-token" })).planToken
		).toBe("persistent-token");
		if (process.platform !== "win32") {
			const metadata = await stat(
				join(storageDirectory, "import-plans.v1.json")
			);
			expect(metadata.mode & 0o777).toBe(0o600);
		}
	});

	it("persists consumption so restart cannot replay a token", async () => {
		const storageDirectory = await createTemporaryDirectory();
		const first = await PersistentImportPlanStore.open({
			buildIdentity: BUILD,
			storageDirectory,
			now: () => NOW,
		});
		await first.put({ artifact: createArtifact() });
		await first.consume({ planToken: "persistent-token" });

		const reopened = await PersistentImportPlanStore.open({
			buildIdentity: BUILD,
			storageDirectory,
			now: () => NOW,
		});
		await expect(
			reopened.consume({ planToken: "persistent-token" })
		).rejects.toBeInstanceOf(ImportPlanConsumedError);
	});

	it("serializes concurrent consume attempts with one durable winner", async () => {
		const storageDirectory = await createTemporaryDirectory();
		const store = await PersistentImportPlanStore.open({
			buildIdentity: BUILD,
			storageDirectory,
			now: () => NOW,
		});
		await store.put({ artifact: createArtifact() });
		const attempts = await Promise.allSettled([
			store.consume({ planToken: "persistent-token" }),
			store.consume({ planToken: "persistent-token" }),
			store.consume({ planToken: "persistent-token" }),
		]);
		expect(
			attempts.filter(({ status }) => status === "fulfilled")
		).toHaveLength(1);
		expect(
			attempts.filter(
				(result) =>
					result.status === "rejected" &&
					result.reason instanceof ImportPlanConsumedError
			)
		).toHaveLength(2);
	});

	it("prunes expired plans durably during reopen", async () => {
		const storageDirectory = await createTemporaryDirectory();
		const first = await PersistentImportPlanStore.open({
			buildIdentity: BUILD,
			storageDirectory,
			now: () => NOW,
		});
		await first.put({ artifact: createArtifact({ ttl: 100 }) });

		const reopened = await PersistentImportPlanStore.open({
			buildIdentity: BUILD,
			storageDirectory,
			now: () => NOW + 101,
		});
		await expect(
			reopened.get({ planToken: "persistent-token" })
		).rejects.toBeInstanceOf(ImportPlanNotFoundError);
		expect(await reopened.getSize()).toBe(0);
	});

	it("quarantines corrupt state and resumes with an empty store", async () => {
		const corruptDirectory = await createTemporaryDirectory();
		const corruptBytes = JSON.stringify({
			schemaVersion: 1,
			entries: [{ status: "ready" }],
		});
		await writeFile(
			join(corruptDirectory, "import-plans.v1.json"),
			corruptBytes
		);
		const recovered = await PersistentImportPlanStore.open({
			buildIdentity: BUILD,
			storageDirectory: corruptDirectory,
			now: () => NOW,
		});
		expect(recovered.startupRecoveryAction).toBe("quarantined-corrupt-store");
		await expect(
			recovered.get({ planToken: "persistent-token" })
		).rejects.toBeInstanceOf(ImportPlanNotFoundError);

		const quarantineFileNames = (await readdir(corruptDirectory)).filter(
			(fileName) => fileName.startsWith("import-plans.v1.json.corrupt.")
		);
		expect(quarantineFileNames).toHaveLength(1);
		const quarantinePath = join(corruptDirectory, quarantineFileNames[0]);
		expect(await readFile(quarantinePath, "utf8")).toBe(corruptBytes);
		if (process.platform !== "win32") {
			const metadata = await stat(quarantinePath);
			expect(metadata.mode & 0o777).toBe(0o600);
		}

		await recovered.put({ artifact: createArtifact() });
		const reopened = await PersistentImportPlanStore.open({
			buildIdentity: BUILD,
			storageDirectory: corruptDirectory,
			now: () => NOW,
		});
		expect(reopened.startupRecoveryAction).toBe("none");
		expect(
			(await reopened.get({ planToken: "persistent-token" })).planToken
		).toBe("persistent-token");
	});

	it("fails closed for a symlinked store file", async () => {
		const symlinkDirectory = await createTemporaryDirectory();
		const targetPath = join(symlinkDirectory, "outside.json");
		await writeFile(
			targetPath,
			JSON.stringify({ schemaVersion: 1, entries: [] })
		);
		await symlink(targetPath, join(symlinkDirectory, "import-plans.v1.json"));
		await expect(
			PersistentImportPlanStore.open({
				buildIdentity: BUILD,
				storageDirectory: symlinkDirectory,
				now: () => NOW,
			})
		).rejects.toBeInstanceOf(PersistentImportPlanStoreUnavailableError);
	});

	it("does not quarantine a non-file store path", async () => {
		const storageDirectory = await createTemporaryDirectory();
		await mkdir(join(storageDirectory, "import-plans.v1.json"));

		await expect(
			PersistentImportPlanStore.open({
				buildIdentity: BUILD,
				storageDirectory,
				now: () => NOW,
			})
		).rejects.toBeInstanceOf(PersistentImportPlanStoreUnavailableError);
		expect(
			(await readdir(storageDirectory)).filter((fileName) =>
				fileName.startsWith("import-plans.v1.json.corrupt.")
			)
		).toHaveLength(0);
	});

	it("persists restricted paths only in the private store", async () => {
		const storageDirectory = await createTemporaryDirectory();
		const store = await PersistentImportPlanStore.open({
			buildIdentity: BUILD,
			storageDirectory,
			now: () => NOW,
		});
		await store.put({ artifact: createArtifact() });
		const privateBytes = await readFile(
			join(storageDirectory, "import-plans.v1.json"),
			"utf8"
		);
		expect(privateBytes).toContain("/private/qcut/source-draft");
		expect(privateBytes).not.toContain("unexpected");
	});
});
