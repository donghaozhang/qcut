// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JianyingKnownFilter } from "../jianying-filter-metadata.js";
import { inspectJianyingFilterPackages } from "../jianying-filter-package-inspector.js";
import type { JianyingLutReference } from "../native-pipeline/filters/filter-lab-lut.js";

const temporaryRoots: string[] = [];

async function temporaryCache() {
	const root = await mkdtemp(join(tmpdir(), "qcut-filter-packages-"));
	temporaryRoots.push(root);
	return root;
}

async function packageFile({
	cacheRoot,
	resourceId,
	version,
	relativePath,
	content = "fixture",
}: {
	cacheRoot: string;
	resourceId: string;
	version: string;
	relativePath: string;
	content?: string | Buffer;
}) {
	const path = join(
		cacheRoot,
		"artistEffect",
		resourceId,
		version,
		relativePath
	);
	await mkdir(join(path, ".."), { recursive: true });
	await writeFile(path, content);
}

function createPngHeader(): Buffer {
	const header = Buffer.alloc(24);
	Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header);
	header.write("IHDR", 12, "ascii");
	header.writeUInt32BE(512, 16);
	header.writeUInt32BE(512, 20);
	return header;
}

function filter({
	resourceId,
	version = "v1",
	requirements,
}: {
	resourceId: string;
	version?: string;
	requirements?: string[];
}): JianyingKnownFilter {
	return {
		resourceId,
		title: resourceId,
		categories: ["测试"],
		version,
		...(requirements ? { requirements } : {}),
	};
}

function reference({
	resourceId,
	role = "single",
	fileName = "filter.cube.vf",
}: {
	resourceId: string;
	role?: JianyingLutReference["role"];
	fileName?: string;
}): JianyingLutReference {
	return {
		lutId: `${resourceId}/v1/${fileName}`,
		resourceId,
		version: "v1",
		fileName,
		filePath: `/private/${fileName}`,
		role,
		size: 17,
	};
}

afterEach(async () => {
	await Promise.all(
		temporaryRoots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true }))
	);
});

describe("Jianying filter package inspector", () => {
	it("classifies cached LUT, dual LUT, shader, face AI, and missing packages", async () => {
		const cacheRoot = await temporaryCache();
		await Promise.all([
			packageFile({
				cacheRoot,
				resourceId: "single",
				version: "v1",
				relativePath: "AmazingFeature/texture/filter.cube.vf",
			}),
			packageFile({
				cacheRoot,
				resourceId: "single",
				version: "v1",
				relativePath: "cover_icon.png",
			}),
			packageFile({
				cacheRoot,
				resourceId: "dual",
				version: "v1",
				relativePath: "AmazingFeature/image/filter_bg.png",
			}),
			packageFile({
				cacheRoot,
				resourceId: "dual",
				version: "v1",
				relativePath: "AmazingFeature/image/filter_skin.png",
			}),
			packageFile({
				cacheRoot,
				resourceId: "shader",
				version: "v1",
				relativePath: "AmazingFeature/xshader/look.frag",
			}),
			packageFile({
				cacheRoot,
				resourceId: "face",
				version: "v1",
				relativePath: "AmazingFeature/model/skin_seg.model",
			}),
		]);
		const filters = ["single", "dual", "shader", "face", "missing"].map(
			(resourceId) => filter({ resourceId })
		);
		const result = await inspectJianyingFilterPackages({
			filters,
			references: [reference({ resourceId: "single" })],
			cacheRoot,
		});

		expect(result.get("single")).toMatchObject({
			cacheStatus: "cached",
			implementation: "single-lut",
			versions: ["v1"],
			hasThumbnail: true,
		});
		expect(result.get("dual")).toMatchObject({
			cacheStatus: "cached",
			implementation: "dual-lut",
		});
		expect(result.get("shader")).toMatchObject({
			cacheStatus: "cached",
			implementation: "shader",
		});
		expect(result.get("face")).toMatchObject({
			cacheStatus: "cached",
			implementation: "face-ai",
		});
		expect(result.get("missing")).toEqual({
			cacheStatus: "uncached",
			implementation: "unknown",
			versions: [],
			hasThumbnail: false,
			issues: [],
		});
	});

	it("uses effect and third-resource identifiers without exposing package paths", async () => {
		const cacheRoot = await temporaryCache();
		await packageFile({
			cacheRoot,
			resourceId: "third-id",
			version: "v1",
			relativePath: "AmazingFeature/xshader/look.xshader",
		});
		const [record] = [
			{
				...filter({ resourceId: "catalog-id" }),
				thirdResourceId: "third-id",
			},
		];
		const result = await inspectJianyingFilterPackages({
			filters: [record],
			references: [],
			cacheRoot,
		});
		const summary = result.get("catalog-id");
		expect(summary).toMatchObject({
			cacheStatus: "cached",
			implementation: "shader",
		});
		expect(JSON.stringify(summary)).not.toContain(cacheRoot);
	});

	it("recognizes a local single-pass tiled LUT renderer without exposing its root", async () => {
		const cacheRoot = await temporaryCache();
		const source = `
			float blueColor = textureColor.b * 63.;
			vec4 newColor1 = texture2D(filterTex, texPos1);
			vec4 newColor2 = texture2D(filterTex, texPos2);
			vec4 newColor = mix(newColor1, newColor2, fract(blueColor));
		`;
		await Promise.all([
			packageFile({
				cacheRoot,
				resourceId: "tiled",
				version: "v1",
				relativePath: "AmazingFeature/image/filter.png",
				content: createPngHeader(),
			}),
			packageFile({
				cacheRoot,
				resourceId: "tiled",
				version: "v1",
				relativePath: "AmazingFeature/shaders/pass/gles2/filter.frag",
				content: source,
			}),
		]);
		const result = await inspectJianyingFilterPackages({
			filters: [filter({ resourceId: "tiled" })],
			references: [],
			cacheRoot,
		});
		expect(result.get("tiled")).toMatchObject({
			implementation: "shader",
			renderer: {
				kind: "tiled-lut-8x8",
				packageIdentifier: "tiled",
				version: "v1",
				relativePath: "AmazingFeature/image/filter.png",
				cubeSize: 64,
			},
		});
		expect(JSON.stringify(result.get("tiled"))).not.toContain(cacheRoot);
	});
});
