import { createHash } from "node:crypto";
import {
	mkdtemp,
	mkdir,
	readFile,
	realpath,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	CAPCUT_E2E_SENTINEL_FILE_NAME,
	CAPCUT_E2E_SENTINEL_PURPOSE,
	CAPCUT_E2E_SENTINEL_SCHEMA,
	CAPCUT_E2E_SENTINEL_VERSION,
	preflightDisposableCapCutStore,
} from "../capcut-e2e/disposable-store-guard.js";

const temporaryDirectories: string[] = [];

interface DisposableStoreFixture {
	canonicalStorePath: string;
	dedicatedTestHomeDirectory: string;
	rootMetaInfoPath: string;
	sentinelPath: string;
}

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(
		join(tmpdir(), "qcut-capcut-disposable-store-")
	);
	temporaryDirectories.push(directory);
	return directory;
}

async function writeJson({
	path,
	value,
}: {
	path: string;
	value: unknown;
}): Promise<string> {
	const serialized = `${JSON.stringify(value, null, 2)}\n`;
	await writeFile(path, serialized, "utf8");
	return serialized;
}

async function createFixture({
	includeRootMetaInfo = true,
	includeSentinel = true,
	rootMetaInfo,
	sentinel,
}: {
	includeRootMetaInfo?: boolean;
	includeSentinel?: boolean;
	rootMetaInfo?: Record<string, unknown> | string;
	sentinel?: Record<string, unknown>;
} = {}): Promise<DisposableStoreFixture> {
	const temporaryDirectory = await createTemporaryDirectory();
	const dedicatedTestHomeDirectory = join(temporaryDirectory, "dedicated-home");
	const storePath = join(
		dedicatedTestHomeDirectory,
		"Movies",
		"CapCut",
		"User Data",
		"Projects",
		"com.lveditor.draft"
	);
	await mkdir(storePath, { recursive: true });
	const canonicalStorePath = await realpath(storePath);
	const rootMetaInfoPath = join(storePath, "root_meta_info.json");
	const sentinelPath = join(storePath, CAPCUT_E2E_SENTINEL_FILE_NAME);

	if (includeRootMetaInfo) {
		if (typeof rootMetaInfo === "string") {
			await writeFile(rootMetaInfoPath, rootMetaInfo, "utf8");
		} else {
			await writeJson({
				path: rootMetaInfoPath,
				value: rootMetaInfo ?? {
					all_draft_store: [],
					draft_ids: 0,
					root_path: canonicalStorePath,
				},
			});
		}
	}
	if (includeSentinel) {
		await writeJson({
			path: sentinelPath,
			value: sentinel ?? {
				canonicalStorePath,
				purpose: CAPCUT_E2E_SENTINEL_PURPOSE,
				schema: CAPCUT_E2E_SENTINEL_SCHEMA,
				version: CAPCUT_E2E_SENTINEL_VERSION,
			},
		});
	}

	return {
		canonicalStorePath,
		dedicatedTestHomeDirectory,
		rootMetaInfoPath,
		sentinelPath,
	};
}

afterEach(async () => {
	const directories = temporaryDirectories.splice(0);
	await Promise.all(
		directories.map((directory) =>
			rm(directory, { force: true, recursive: true })
		)
	);
});

describe("disposable CapCut store guard", () => {
	it("returns a loggable report for a canonical empty disposable store", async () => {
		const fixture = await createFixture();
		const rootBytes = await readFile(fixture.rootMetaInfoPath);
		const rootStats = await stat(fixture.rootMetaInfoPath, { bigint: true });

		const report = await preflightDisposableCapCutStore({
			dedicatedTestHomeDirectory: fixture.dedicatedTestHomeDirectory,
		});

		expect(report).toMatchObject({
			canonicalStorePath: fixture.canonicalStorePath,
			draftCount: 0,
			draftIds: [],
			rootMetaInfo: {
				bytes: rootBytes.length,
				inode: rootStats.ino.toString(),
				path: join(fixture.canonicalStorePath, "root_meta_info.json"),
				sha256: createHash("sha256").update(rootBytes).digest("hex"),
			},
			sentinel: {
				canonicalStorePath: fixture.canonicalStorePath,
				purpose: CAPCUT_E2E_SENTINEL_PURPOSE,
				schema: CAPCUT_E2E_SENTINEL_SCHEMA,
				version: CAPCUT_E2E_SENTINEL_VERSION,
			},
		});
		expect(report.rootMetaInfo.modifiedAtMilliseconds).toBeCloseTo(
			Number(rootStats.mtimeNs) / 1_000_000,
			3
		);
		expect(() => JSON.stringify(report)).not.toThrow();
	});

	it("rejects a real-store-like home before touching the filesystem", async () => {
		const temporaryDirectory = await createTemporaryDirectory();
		const fakePeterHome = join(temporaryDirectory, "Users", "peter");

		await expect(
			preflightDisposableCapCutStore({
				dedicatedTestHomeDirectory: fakePeterHome,
				forbiddenHomeDirectory: fakePeterHome,
			})
		).rejects.toThrow("must not be Peter's real home directory");
	});

	it("rejects descendants of Peter's home before touching the filesystem", async () => {
		await expect(
			preflightDisposableCapCutStore({
				dedicatedTestHomeDirectory:
					"/Users/peter/.qcut-capcut-e2e-disposable-home",
			})
		).rejects.toThrow("or any descendant");
	});

	it("rejects descendants of an injected forbidden home", async () => {
		const temporaryDirectory = await createTemporaryDirectory();
		const forbiddenHomeDirectory = join(
			temporaryDirectory,
			"Users",
			"operator"
		);

		await expect(
			preflightDisposableCapCutStore({
				dedicatedTestHomeDirectory: join(
					forbiddenHomeDirectory,
					"disposable-home"
				),
				forbiddenHomeDirectory,
			})
		).rejects.toThrow("or any descendant");
	});

	it.skipIf(process.platform !== "darwin" && process.platform !== "win32")(
		"rejects mixed-case descendants before touching the filesystem",
		async () => {
			const temporaryDirectory = await createTemporaryDirectory();
			const forbiddenHomeDirectory = join(
				temporaryDirectory,
				"Users",
				"Operator"
			);

			await expect(
				preflightDisposableCapCutStore({
					dedicatedTestHomeDirectory: join(
						temporaryDirectory,
						"users",
						"operator",
						"disposable-home"
					),
					forbiddenHomeDirectory,
				})
			).rejects.toThrow("or any descendant");
		}
	);

	it("rejects a missing sentinel", async () => {
		const fixture = await createFixture({ includeSentinel: false });

		await expect(
			preflightDisposableCapCutStore({
				dedicatedTestHomeDirectory: fixture.dedicatedTestHomeDirectory,
			})
		).rejects.toThrow("disposable-store sentinel is required");
	});

	it("rejects a sentinel copied from a different store", async () => {
		const fixture = await createFixture();
		await writeJson({
			path: fixture.sentinelPath,
			value: {
				canonicalStorePath: join(fixture.canonicalStorePath, "copied"),
				purpose: CAPCUT_E2E_SENTINEL_PURPOSE,
				schema: CAPCUT_E2E_SENTINEL_SCHEMA,
				version: CAPCUT_E2E_SENTINEL_VERSION,
			},
		});

		await expect(
			preflightDisposableCapCutStore({
				dedicatedTestHomeDirectory: fixture.dedicatedTestHomeDirectory,
			})
		).rejects.toThrow("canonicalStorePath does not match the current store");
	});

	it("rejects a store whose root metadata contains a draft", async () => {
		const fixture = await createFixture();
		await writeJson({
			path: fixture.rootMetaInfoPath,
			value: {
				all_draft_store: [{ draft_id: "existing-draft" }],
				draft_ids: 1,
				root_path: fixture.canonicalStorePath,
			},
		});

		await expect(
			preflightDisposableCapCutStore({
				dedicatedTestHomeDirectory: fixture.dedicatedTestHomeDirectory,
			})
		).rejects.toThrow("must be empty; found 1 draft(s): existing-draft");
	});

	it.skipIf(process.platform === "win32")(
		"rejects a symlinked store",
		async () => {
			const temporaryDirectory = await createTemporaryDirectory();
			const dedicatedTestHomeDirectory = join(
				temporaryDirectory,
				"dedicated-home"
			);
			const projectsDirectory = join(
				dedicatedTestHomeDirectory,
				"Movies",
				"CapCut",
				"User Data",
				"Projects"
			);
			const symlinkTarget = join(temporaryDirectory, "store-target");
			await Promise.all([
				mkdir(projectsDirectory, { recursive: true }),
				mkdir(symlinkTarget, { recursive: true }),
			]);
			await symlink(
				symlinkTarget,
				join(projectsDirectory, "com.lveditor.draft"),
				"dir"
			);

			await expect(
				preflightDisposableCapCutStore({ dedicatedTestHomeDirectory })
			).rejects.toThrow("must not be a symbolic link");
		}
	);

	it.skipIf(process.platform === "win32")(
		"rejects a symlinked dedicated home",
		async () => {
			const fixture = await createFixture();
			const homeAlias = join(
				await createTemporaryDirectory(),
				"dedicated-home-alias"
			);
			await symlink(fixture.dedicatedTestHomeDirectory, homeAlias, "dir");

			await expect(
				preflightDisposableCapCutStore({
					dedicatedTestHomeDirectory: homeAlias,
				})
			).rejects.toThrow("must not be a symbolic link");
		}
	);

	it.each([
		{ controlFile: "root metadata", fixturePath: "rootMetaInfoPath" as const },
		{ controlFile: "sentinel", fixturePath: "sentinelPath" as const },
	])("rejects a symlinked $controlFile file", async ({ fixturePath }) => {
		if (process.platform === "win32") return;
		const fixture = await createFixture();
		const originalPath = fixture[fixturePath];
		const replacementPath = `${originalPath}.replacement`;
		await writeFile(replacementPath, await readFile(originalPath));
		await rm(originalPath);
		await symlink(replacementPath, originalPath, "file");

		await expect(
			preflightDisposableCapCutStore({
				dedicatedTestHomeDirectory: fixture.dedicatedTestHomeDirectory,
			})
		).rejects.toThrow("must not be a symbolic link");
	});

	it("rejects malformed root metadata", async () => {
		const fixture = await createFixture({ rootMetaInfo: "{not-json" });

		await expect(
			preflightDisposableCapCutStore({
				dedicatedTestHomeDirectory: fixture.dedicatedTestHomeDirectory,
			})
		).rejects.toThrow("root_meta_info.json must contain valid JSON");
	});

	it("rejects missing root metadata", async () => {
		const fixture = await createFixture({ includeRootMetaInfo: false });

		await expect(
			preflightDisposableCapCutStore({
				dedicatedTestHomeDirectory: fixture.dedicatedTestHomeDirectory,
			})
		).rejects.toThrow("root_meta_info.json is required");
	});

	it("rejects root metadata bound to a different store", async () => {
		const fixture = await createFixture();
		await writeJson({
			path: fixture.rootMetaInfoPath,
			value: {
				all_draft_store: [],
				draft_ids: 0,
				root_path: join(fixture.canonicalStorePath, "other"),
			},
		});

		await expect(
			preflightDisposableCapCutStore({
				dedicatedTestHomeDirectory: fixture.dedicatedTestHomeDirectory,
			})
		).rejects.toThrow("root_path must match the canonical store path");
	});

	it.each([
		{
			error: "unsupported schema",
			override: { schema: "copied.schema" },
		},
		{
			error: "unsupported version",
			override: { version: CAPCUT_E2E_SENTINEL_VERSION + 1 },
		},
		{
			error: "invalid purpose",
			override: { purpose: "personal-drafts" },
		},
	])("rejects a sentinel with an $error", async ({ error, override }) => {
		const fixture = await createFixture();
		await writeJson({
			path: fixture.sentinelPath,
			value: {
				canonicalStorePath: fixture.canonicalStorePath,
				purpose: CAPCUT_E2E_SENTINEL_PURPOSE,
				schema: CAPCUT_E2E_SENTINEL_SCHEMA,
				version: CAPCUT_E2E_SENTINEL_VERSION,
				...override,
			},
		});

		await expect(
			preflightDisposableCapCutStore({
				dedicatedTestHomeDirectory: fixture.dedicatedTestHomeDirectory,
			})
		).rejects.toThrow(error);
	});

	it("rejects orphan content even when root metadata claims zero drafts", async () => {
		const fixture = await createFixture();
		await mkdir(join(fixture.canonicalStorePath, "orphan-draft"));

		await expect(
			preflightDisposableCapCutStore({
				dedicatedTestHomeDirectory: fixture.dedicatedTestHomeDirectory,
			})
		).rejects.toThrow("must contain only its sentinel and root_meta_info.json");
	});
});
