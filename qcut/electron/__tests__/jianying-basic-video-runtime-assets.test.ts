// @vitest-environment node
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	isValidJianyingDeflickerHost,
	JIANYING_DEFLICKER_HOST_REQUIRED_MARKERS,
} from "../jianying-basic-video-runtime/bridge-resolver.js";
import { verifyJianyingBasicVideoRuntime } from "../jianying-basic-video-runtime/runtime-assets.js";

const temporaryDirectories: string[] = [];

async function temporaryDirectory({ prefix }: { prefix: string }) {
	const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
	temporaryDirectories.push(directory);
	return directory;
}

async function writeManifests({
	basicManifest,
	transitionManifest,
}: {
	basicManifest: unknown;
	transitionManifest: unknown;
}) {
	const root = await temporaryDirectory({ prefix: "qcut-basic-video-assets-" });
	const basicRoot = path.join(root, "basic");
	const lensRoot = path.join(root, "lens");
	await Promise.all([
		mkdir(basicRoot, { recursive: true }),
		mkdir(lensRoot, { recursive: true }),
	]);
	await Promise.all([
		writeFile(
			path.join(basicRoot, "manifest.json"),
			JSON.stringify(basicManifest)
		),
		writeFile(
			path.join(lensRoot, "qcut-effect-runtime.json"),
			JSON.stringify(transitionManifest)
		),
	]);
	return { basicRoot, lensRoot };
}

describe("Jianying basic video runtime assets", () => {
	afterEach(async () => {
		await Promise.all(
			temporaryDirectories
				.splice(0)
				.map((directory) => rm(directory, { force: true, recursive: true }))
		);
	});

	it("rejects a private model manifest from another Jianying version", async () => {
		const roots = await writeManifests({
			basicManifest: { files: [], version: "11.2.0" },
			transitionManifest: {
				cloudUpload: false,
				files: [],
				localOnly: true,
				schemaVersion: 1,
			},
		});

		await expect(
			verifyJianyingBasicVideoRuntime({
				basicVideoRoot: roots.basicRoot,
				lensRuntimeRoot: roots.lensRoot,
			})
		).rejects.toThrow("版本不受支持");
	});

	it("rejects a runtime manifest that is not marked local-only", async () => {
		const roots = await writeManifests({
			basicManifest: { files: [], version: "11.3.0" },
			transitionManifest: {
				cloudUpload: false,
				files: [],
				localOnly: false,
				schemaVersion: 1,
			},
		});

		await expect(
			verifyJianyingBasicVideoRuntime({
				basicVideoRoot: roots.basicRoot,
				lensRuntimeRoot: roots.lensRoot,
			})
		).rejects.toThrow("清单无效");
	});

	it("requires every audited marker in an executable Mach-O host", async () => {
		const directory = await temporaryDirectory({
			prefix: "qcut-deflicker-host-",
		});
		const hostPath = path.join(directory, "host");
		const image = Buffer.alloc(8192);
		Buffer.from([0xcf, 0xfa, 0xed, 0xfe]).copy(image);
		let offset = 128;
		for (const marker of JIANYING_DEFLICKER_HOST_REQUIRED_MARKERS) {
			offset += image.write(marker, offset) + 8;
		}
		await writeFile(hostPath, image);
		await chmod(hostPath, 0o700);

		expect(await isValidJianyingDeflickerHost({ filePath: hostPath })).toBe(
			true
		);
		image.fill(0, 128);
		await writeFile(hostPath, image);

		expect(await isValidJianyingDeflickerHost({ filePath: hostPath })).toBe(
			false
		);
	});
});
