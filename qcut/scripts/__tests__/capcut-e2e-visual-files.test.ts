import { createHash } from "node:crypto";
import {
	mkdtemp,
	mkdir,
	rename,
	rm,
	symlink,
	truncate,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	describeVisualCapture,
	readVisualFileSnapshot,
	readVisualJsonFileSnapshot,
} from "../capcut-e2e/visual-files.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "qcut-visual-files-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	for (const directory of temporaryDirectories.splice(0)) {
		await rm(directory, { force: true, recursive: true });
	}
});

describe("visual file-integrity snapshots", () => {
	it("derives byte count, hash, and JSON value from one stable byte snapshot", async () => {
		const directory = await createTemporaryDirectory();
		const path = join(directory, "manifest.json");
		const bytes = Buffer.from('{"runId":"stable"}\n', "utf8");
		await writeFile(path, bytes);

		const snapshot = await readVisualJsonFileSnapshot({
			label: "Fixture manifest",
			path,
		});

		expect(snapshot.bytes).toEqual(bytes);
		expect(snapshot.evidence).toEqual({
			bytes: bytes.length,
			path,
			sha256: createHash("sha256").update(bytes).digest("hex"),
		});
		expect(snapshot.value).toEqual({ runId: "stable" });
	});

	it("rejects a visual file symlink", async () => {
		const directory = await createTemporaryDirectory();
		const targetPath = join(directory, "target.png");
		const linkedPath = join(directory, "linked.png");
		await writeFile(targetPath, "pixels");
		await symlink(targetPath, linkedPath, "file");

		await expect(readVisualFileSnapshot({ path: linkedPath })).rejects.toThrow(
			"must not be a symbolic link"
		);
	});

	it("rejects oversized sparse evidence before reading it into memory", async () => {
		const directory = await createTemporaryDirectory();
		const path = join(directory, "oversized.png");
		await writeFile(path, "x");
		await truncate(path, 512 * 1024 * 1024 + 1);

		await expect(readVisualFileSnapshot({ path })).rejects.toThrow(
			"evidence limit"
		);
	});

	it("rejects captures outside the allowed directory and symlink traversal", async () => {
		const directory = await createTemporaryDirectory();
		const capturesDirectory = join(directory, "captures");
		const outsideDirectory = join(directory, "outside");
		await Promise.all([mkdir(capturesDirectory), mkdir(outsideDirectory)]);
		const outsidePath = join(outsideDirectory, "capture.png");
		await writeFile(outsidePath, "pixels");

		await expect(
			describeVisualCapture({
				capturesDirectory,
				path: outsidePath,
			})
		).rejects.toThrow("outside its allowed captures directory");

		const linkedDirectory = join(capturesDirectory, "linked");
		await symlink(outsideDirectory, linkedDirectory, "dir");
		await expect(
			describeVisualCapture({
				capturesDirectory,
				path: join(linkedDirectory, "capture.png"),
			})
		).rejects.toThrow("must not traverse a symbolic link");
	});

	it("fails closed when a capture path is replaced after its bytes are read", async () => {
		const directory = await createTemporaryDirectory();
		const capturesDirectory = join(directory, "captures");
		await mkdir(capturesDirectory);
		const capturePath = join(capturesDirectory, "capture.png");
		const originalPath = join(capturesDirectory, "capture.original.png");
		await writeFile(capturePath, "original-capture");

		await expect(
			describeVisualCapture({
				capturesDirectory,
				path: capturePath,
				testingHooks: {
					afterBytesRead: async () => {
						await rename(capturePath, originalPath);
						await writeFile(capturePath, "replacement-capture");
					},
				},
			})
		).rejects.toThrow("changed while its file-integrity snapshot was read");
	});

	it("fails closed when a capture is partially mutated during its read", async () => {
		const directory = await createTemporaryDirectory();
		const capturesDirectory = join(directory, "captures");
		await mkdir(capturesDirectory);
		const capturePath = join(capturesDirectory, "capture.png");
		await writeFile(capturePath, "complete-capture");

		await expect(
			describeVisualCapture({
				capturesDirectory,
				path: capturePath,
				testingHooks: {
					afterBytesRead: async () => truncate(capturePath, 4),
				},
			})
		).rejects.toThrow("changed while its file-integrity snapshot was read");
	});

	it("does not parse a replacement manifest under evidence for prior bytes", async () => {
		const directory = await createTemporaryDirectory();
		const manifestPath = join(directory, "manifest.json");
		const originalPath = join(directory, "manifest.original.json");
		await writeFile(manifestPath, '{"runId":"original"}');

		await expect(
			readVisualJsonFileSnapshot({
				label: "Fixture manifest",
				path: manifestPath,
				testingHooks: {
					afterBytesRead: async () => {
						await rename(manifestPath, originalPath);
						await writeFile(manifestPath, '{"runId":"replacement"}');
					},
				},
			})
		).rejects.toThrow("changed while its file-integrity snapshot was read");
	});
});
