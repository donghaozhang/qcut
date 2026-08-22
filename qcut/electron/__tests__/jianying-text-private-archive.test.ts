// @vitest-environment node
import { mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
	ensureQCutJianyingTextPrivateArchive,
	findQCutJianyingTextPrivateArchive,
} from "../jianying-text-private-archive.js";

async function writeFixture({
	filePath,
	value,
}: {
	filePath: string;
	value: string;
}) {
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, value, "utf8");
}

describe("QCut Jianying text private archive", () => {
	let workspace = "";
	let sourceCacheRoot = "";
	let archiveRoot = "";

	beforeEach(async () => {
		workspace = await mkdtemp(join(tmpdir(), "qcut-text-archive-"));
		sourceCacheRoot = join(workspace, "source");
		archiveRoot = join(workspace, "archive");
		await Promise.all([
			writeFixture({
				filePath: join(
					sourceCacheRoot,
					"artistEffect",
					"100",
					"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					"config.json"
				),
				value: '{"kind":"TextStyle"}',
			}),
			writeFixture({
				filePath: join(
					sourceCacheRoot,
					"effect",
					"200",
					"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
					"content.json"
				),
				value: '{"animation":"loop"}',
			}),
			writeFixture({
				filePath: join(sourceCacheRoot, "ressdk_db", "account", "rp.db"),
				value: "sqlite-fixture",
			}),
			writeFixture({
				filePath: join(
					sourceCacheRoot,
					"recovered-resources",
					"effect",
					"300",
					"dddddddddddddddddddddddddddddddd",
					"content.json"
				),
				value: '{"dependency":"recovered"}',
			}),
			writeFixture({
				filePath: join(
					sourceCacheRoot,
					"project-evidence",
					"draft-one",
					"key_value.json"
				),
				value: '{"materialCategory":"text"}',
			}),
			writeFixture({
				filePath: join(
					sourceCacheRoot,
					"project-evidence",
					"draft-one",
					"video.mp4"
				),
				value: "must-not-copy",
			}),
		]);
	});

	it("copies packages, dependencies, and metadata before publishing a manifest", async () => {
		const archive = await ensureQCutJianyingTextPrivateArchive({
			archiveRoot,
			sourceCacheRoot,
		});
		expect(
			await readFile(
				join(
					archive.packageRoot,
					"100",
					"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					"config.json"
				),
				"utf8"
			)
		).toContain("TextStyle");
		expect(
			await readFile(
				join(
					archive.animationPackageRoot,
					"200",
					"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
					"content.json"
				),
				"utf8"
			)
		).toContain("loop");
		expect(archive.manifest.containers.artistEffect.fileCount).toBe(1);
		expect(archive.manifest.containers["recovered-resources"].fileCount).toBe(
			1
		);
		expect(archive.manifest.containers["project-evidence"].fileCount).toBe(1);
		expect(
			await readFile(
				join(
					archive.recoveryRoot,
					"effect",
					"300",
					"dddddddddddddddddddddddddddddddd",
					"content.json"
				),
				"utf8"
			)
		).toContain("recovered");
		expect(
			await readFile(
				join(archive.projectEvidenceRoot, "draft-one", "key_value.json"),
				"utf8"
			)
		).toContain("materialCategory");
		expect(
			await findQCutJianyingTextPrivateArchive({ archiveRoot })
		).not.toBeNull();
	});

	it("uses a completed QCut archive after the Jianying source disappears", async () => {
		const first = await ensureQCutJianyingTextPrivateArchive({
			archiveRoot,
			sourceCacheRoot,
		});
		const restored = await ensureQCutJianyingTextPrivateArchive({
			archiveRoot,
			sourceCacheRoot: join(workspace, "missing-jianying"),
			refresh: true,
		});
		expect(restored.cacheRoot).toBe(first.cacheRoot);
	});

	it("incrementally adds new packages without removing older backups", async () => {
		await ensureQCutJianyingTextPrivateArchive({
			archiveRoot,
			sourceCacheRoot,
		});
		await writeFixture({
			filePath: join(
				sourceCacheRoot,
				"artistEffect",
				"101",
				"cccccccccccccccccccccccccccccccc",
				"config.json"
			),
			value: '{"kind":"InfoSticker"}',
		});
		const refreshed = await ensureQCutJianyingTextPrivateArchive({
			archiveRoot,
			sourceCacheRoot,
			refresh: true,
		});
		expect(refreshed.manifest.containers.artistEffect.fileCount).toBe(2);
	});

	it("repairs a missing private file during an incremental refresh", async () => {
		const archive = await ensureQCutJianyingTextPrivateArchive({
			archiveRoot,
			sourceCacheRoot,
		});
		const backedUpConfig = join(
			archive.packageRoot,
			"100",
			"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			"config.json"
		);
		await unlink(backedUpConfig);

		await ensureQCutJianyingTextPrivateArchive({
			archiveRoot,
			sourceCacheRoot,
			refresh: true,
		});

		expect(await readFile(backedUpConfig, "utf8")).toContain("TextStyle");
	});

	it("keeps QCut-downloaded packages in the private manifest", async () => {
		const archive = await ensureQCutJianyingTextPrivateArchive({
			archiveRoot,
			sourceCacheRoot,
		});
		await writeFixture({
			filePath: join(
				archive.packageRoot,
				"102",
				"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
				"config.json"
			),
			value: '{"kind":"QCut-private-download"}',
		});

		const refreshed = await ensureQCutJianyingTextPrivateArchive({
			archiveRoot,
			sourceCacheRoot,
			refresh: true,
		});

		expect(refreshed.manifest.containers.artistEffect.fileCount).toBe(2);
	});

	it("does not accept an incomplete archive when no source exists", async () => {
		await mkdir(join(archiveRoot, "Cache", "artistEffect"), {
			recursive: true,
		});
		await expect(
			ensureQCutJianyingTextPrivateArchive({
				archiveRoot,
				sourceCacheRoot: join(workspace, "missing-jianying"),
			})
		).rejects.toThrow("尚未建立花字私有备份");
	});
});
