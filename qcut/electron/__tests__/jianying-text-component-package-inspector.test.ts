// @vitest-environment node
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectJianyingTextComponentPackage } from "../jianying-text-runtime/component-package-inspector.js";

const temporaryDirectories: string[] = [];

async function createPackage({
	version = "12.4.0",
}: {
	version?: string;
} = {}) {
	const packagePath = await mkdtemp(
		path.join(os.tmpdir(), "qcut-text-component-")
	);
	temporaryDirectories.push(packagePath);
	await writeFile(
		path.join(packagePath, "config.json"),
		JSON.stringify({ version, effect: { Link: [{ type: "InfoSticker" }] } })
	);
	return packagePath;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying text component package inspector", () => {
	it("classifies shader, mesh, texture, and temporal feedback signals", async () => {
		const packagePath = await createPackage();
		await Promise.all([
			writeFile(
				path.join(packagePath, "feedback.frag"),
				"uniform sampler2D previousTexture; void main() {}"
			),
			writeFile(path.join(packagePath, "surface.mesh"), "synthetic mesh"),
			writeFile(path.join(packagePath, "history.rt"), "synthetic target"),
			writeFile(path.join(packagePath, "surface.png"), "synthetic texture"),
			writeFile(path.join(packagePath, "TextAnim.lua"), "Camera perspective"),
		]);

		const first = await inspectJianyingTextComponentPackage({ packagePath });
		expect(first).toMatchObject({
			schemaVersion: 1,
			packageVersion: "12.4.0",
			shaderFileCount: 1,
			meshFileCount: 1,
			renderTargetCount: 1,
			scriptFileCount: 1,
			textureFileCount: 1,
			capabilities: {
				staticTexture: true,
				animationComponents: true,
				shaderComponents: true,
				threeDimensional: true,
				feedbackComponents: true,
			},
		});
		expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);

		await writeFile(
			path.join(packagePath, "feedback.frag"),
			"uniform sampler2D previousTexture; void main() { /* changed */ }"
		);
		const changed = await inspectJianyingTextComponentPackage({ packagePath });
		expect(changed.fingerprint).not.toBe(first.fingerprint);
	});

	it("does not mistake an ordinary render target for temporal feedback", async () => {
		const packagePath = await createPackage();
		await Promise.all([
			writeFile(path.join(packagePath, "pass.rt"), "synthetic target"),
			writeFile(
				path.join(packagePath, "pass.frag"),
				"uniform sampler2D sourceTexture; void main() {}"
			),
		]);

		const manifest = await inspectJianyingTextComponentPackage({ packagePath });
		expect(manifest.renderTargetCount).toBe(1);
		expect(manifest.capabilities.shaderComponents).toBe(true);
		expect(manifest.capabilities.feedbackComponents).toBe(false);
	});

	it("rejects package entries that resolve outside the package root", async () => {
		const packagePath = await createPackage();
		const outside = await mkdtemp(path.join(os.tmpdir(), "qcut-text-outside-"));
		temporaryDirectories.push(outside);
		await mkdir(path.join(packagePath, "nested"), { recursive: true });
		await writeFile(path.join(outside, "secret.frag"), "void main() {}");
		await symlink(
			path.join(outside, "secret.frag"),
			path.join(packagePath, "nested", "escape.frag")
		);

		await expect(
			inspectJianyingTextComponentPackage({ packagePath })
		).rejects.toThrow("unsafe path");
	});
});
