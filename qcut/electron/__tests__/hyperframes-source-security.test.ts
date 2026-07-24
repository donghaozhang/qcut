import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	resolveHyperframesAsset,
	validateHyperframesSource,
} from "../hyperframes/source-security";

const temporaryPaths: string[] = [];

function createProject(): {
	rootPath: string;
	sourcePath: string;
	assetPath: string;
} {
	const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-hf-test-"));
	temporaryPaths.push(rootPath);
	const sourcePath = path.join(rootPath, "index.html");
	const assetPath = path.join(rootPath, "assets", "image.png");
	fs.mkdirSync(path.dirname(assetPath));
	fs.writeFileSync(sourcePath, "<html></html>");
	fs.writeFileSync(assetPath, "image");
	return { rootPath, sourcePath, assetPath };
}

afterEach(() => {
	for (const temporaryPath of temporaryPaths.splice(0)) {
		fs.rmSync(temporaryPath, { recursive: true, force: true });
	}
});

describe("validateHyperframesSource", () => {
	it("returns canonical source data", () => {
		const project = createProject();
		const source = validateHyperframesSource({
			sourcePath: project.sourcePath,
		});

		expect(source.sourcePath).toBe(fs.realpathSync(project.sourcePath));
		expect(source.projectPath).toBe(fs.realpathSync(project.rootPath));
		expect(source.html).toBe("<html></html>");
	});

	it("rejects non-HTML files", () => {
		const project = createProject();
		expect(() =>
			validateHyperframesSource({ sourcePath: project.assetPath })
		).toThrow("HTML");
	});
});

describe("resolveHyperframesAsset", () => {
	it("serves contained assets", () => {
		const project = createProject();
		expect(
			resolveHyperframesAsset({
				projectPath: fs.realpathSync(project.rootPath),
				urlPath: "assets/image.png",
			})
		).toBe(fs.realpathSync(project.assetPath));
	});

	it("blocks traversal and symlink escape", () => {
		const project = createProject();
		const outsideRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "qcut-hf-outside-")
		);
		temporaryPaths.push(outsideRoot);
		const outsideFile = path.join(outsideRoot, "secret.txt");
		fs.writeFileSync(outsideFile, "secret");
		const symlinkPath = path.join(project.rootPath, "assets", "secret.txt");
		fs.symlinkSync(outsideFile, symlinkPath);

		expect(
			resolveHyperframesAsset({
				projectPath: fs.realpathSync(project.rootPath),
				urlPath: "../secret.txt",
			})
		).toBeNull();
		expect(
			resolveHyperframesAsset({
				projectPath: fs.realpathSync(project.rootPath),
				urlPath: "assets/secret.txt",
			})
		).toBeNull();
	});
});
