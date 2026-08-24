// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveJianyingScriptHost } from "../jianying-text-runtime/script-host-resolver.js";

const directories: string[] = [];

async function writeScriptPackage({
	containerRoot,
	resourceId,
	packageHash,
	version,
	mainScript,
	content,
}: {
	containerRoot: string;
	resourceId: string;
	packageHash: string;
	version: string;
	mainScript: string;
	content: unknown;
}) {
	const packagePath = path.join(containerRoot, resourceId, packageHash);
	await mkdir(path.join(packagePath, "js", "template"), { recursive: true });
	await Promise.all([
		writeFile(
			path.join(packagePath, "config.json"),
			JSON.stringify({ version }),
			"utf8"
		),
		writeFile(
			path.join(packagePath, "content.json"),
			JSON.stringify(content),
			"utf8"
		),
		writeFile(path.join(packagePath, "js", "main.js"), mainScript, "utf8"),
		writeFile(
			path.join(packagePath, "js", "template", "template.js"),
			`template-${version}`,
			"utf8"
		),
	]);
	return packagePath;
}

afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying script host resolution", () => {
	it("selects the newest compatible local host for a custom contour", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "qcut-script-host-"));
		directories.push(root);
		const containerRoot = path.join(root, "artistEffect");
		const target = await writeScriptPackage({
			containerRoot,
			resourceId: "target",
			packageHash: "target-version",
			version: "16.6.0",
			mainScript: "new Amaz.IFShapeDrawSolidFill()",
			content: {
				children: [{ type: "shape", shape_params: { shape_type: 4 } }],
			},
		});
		await Promise.all([
			writeScriptPackage({
				containerRoot,
				resourceId: "host-18",
				packageHash: "host-version",
				version: "18.5.0",
				mainScript: "IFShapeDrawFill IFShapeDrawStroke",
				content: { children: [] },
			}),
			writeScriptPackage({
				containerRoot,
				resourceId: "host-19",
				packageHash: "host-version",
				version: "19.1.0",
				mainScript: "IFShapeDrawFill IFShapeDrawStroke",
				content: { children: [] },
			}),
		]);

		const resolution = await resolveJianyingScriptHost({ packagePath: target });

		expect(resolution).toMatchObject({
			required: true,
			host: { version: "19.1.0" },
		});
		expect(resolution.host?.packagePath).toContain(
			`${path.sep}host-19${path.sep}`
		);
	});

	it("keeps the source host when the template has no custom contour", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "qcut-script-host-"));
		directories.push(root);
		const target = await writeScriptPackage({
			containerRoot: path.join(root, "artistEffect"),
			resourceId: "target",
			packageHash: "target-version",
			version: "16.6.0",
			mainScript: "new Amaz.IFShapeDrawSolidFill()",
			content: { children: [{ type: "text" }] },
		});

		await expect(
			resolveJianyingScriptHost({ packagePath: target })
		).resolves.toEqual({ host: null, required: false });
	});

	it("reports when a required compatible host is unavailable", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "qcut-script-host-"));
		directories.push(root);
		const target = await writeScriptPackage({
			containerRoot: path.join(root, "artistEffect"),
			resourceId: "target",
			packageHash: "target-version",
			version: "16.6.0",
			mainScript: "new Amaz.IFShapeDrawSolidFill()",
			content: {
				children: [{ type: "shape", shape_params: { shape_type: 4 } }],
			},
		});

		await expect(
			resolveJianyingScriptHost({ packagePath: target })
		).resolves.toEqual({ host: null, required: true });
	});
});
