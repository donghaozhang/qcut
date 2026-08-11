// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildJianyingTextStyleCatalog,
	isValidJianyingTextStyleId,
	readJianyingTextStyleCover,
} from "../jianying-text-style-lab-catalog.js";

const temporaryDirectories: string[] = [];
const PNG_BYTES = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01,
]);

async function createTemporaryDirectory() {
	const directory = await mkdtemp(join(tmpdir(), "qcut-text-style-lab-"));
	temporaryDirectories.push(directory);
	return directory;
}

async function createPackage({
	root,
	resourceId,
	version,
	type,
	style,
	validStyleJson = true,
}: {
	root: string;
	resourceId: string;
	version: string;
	type: string;
	style: Record<string, unknown>;
	validStyleJson?: boolean;
}) {
	const directory = join(root, resourceId, version);
	await mkdir(directory, { recursive: true });
	await Promise.all([
		writeFile(
			join(directory, "config.json"),
			JSON.stringify({ effect: { Link: [{ type }] } })
		),
		writeFile(
			join(directory, "effectStyle.json"),
			validStyleJson ? JSON.stringify(style) : "{"
		),
		writeFile(join(directory, "cover_icon.png"), PNG_BYTES),
	]);
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

const solidStyle = {
	version: "3.0",
	fill: {
		alpha: 1,
		content: {
			render_type: "solid",
			solid: { alpha: 1, color: [1, 0.5, 0] },
		},
	},
	strokes: [
		{
			alpha: 0.8,
			enable: true,
			width: 0.05,
			content: {
				render_type: "solid",
				solid: { alpha: 1, color: [0.1, 0.2, 0.3] },
			},
		},
	],
	inner_shadows: [],
	shadows: [
		{
			alpha: 0.7,
			enable: true,
			distance: 6,
			angle: -90,
			diffuse: 0.1,
			content: {
				render_type: "solid",
				solid: { alpha: 1, color: [0, 0, 0] },
			},
		},
	],
};

describe("Jianying text style lab catalog", () => {
	it("classifies editable TextStyle packages and builds a bounded QCut mapping", async () => {
		const root = await createTemporaryDirectory();
		await Promise.all([
			createPackage({
				root,
				resourceId: "7405879107424111910",
				version: "1".repeat(32),
				type: "TextStyle",
				style: solidStyle,
			}),
			createPackage({
				root,
				resourceId: "7630700699546029374",
				version: "2".repeat(32),
				type: "TextStyle",
				style: {
					...solidStyle,
					fill: { content: { render_type: "texture" } },
				},
			}),
			createPackage({
				root,
				resourceId: "7302284543652908288",
				version: "3".repeat(32),
				type: "TextStyle",
				style: solidStyle,
				validStyleJson: false,
			}),
			createPackage({
				root,
				resourceId: "7347967906669415716",
				version: "4".repeat(32),
				type: "InfoSticker",
				style: solidStyle,
			}),
		]);

		const catalog = await buildJianyingTextStyleCatalog({ root });
		expect(catalog).toMatchObject({
			packageCount: 4,
			invalidPackageCount: 1,
		});
		expect(catalog.entries).toHaveLength(3);
		const solid = catalog.entries.find(
			({ resourceId }) => resourceId === "7405879107424111910"
		);
		expect(solid).toMatchObject({
			packageKind: "TextStyle",
			fillKind: "solid",
			compatibility: "flat-compatible",
			strokeCount: 1,
			shadowCount: 1,
			hasCover: true,
			approximation: {
				color: "#ff8000",
				strokeColor: "#1a334d",
				strokeWidth: 3.6,
				shadowOffsetX: expect.closeTo(0, 5),
				shadowOffsetY: 6,
			},
		});
		const texture = catalog.entries.find(
			({ resourceId }) => resourceId === "7630700699546029374"
		);
		expect(texture).toMatchObject({
			fillKind: "texture",
			compatibility: "preview-only",
		});
		expect(texture).not.toHaveProperty("approximation");
		expect(
			catalog.entries.find(
				({ resourceId }) => resourceId === "7347967906669415716"
			)
		).toMatchObject({
			packageKind: "InfoSticker",
			fillKind: "unknown",
			compatibility: "native-runtime",
			hasCover: true,
			runtimeReference: {
				schemaVersion: 1,
				source: "jianying-cache",
				packageKind: "InfoSticker",
				resourceId: "7347967906669415716",
				packageHash: "4".repeat(32),
				editMode: "runtime-with-preload-fallback",
				slotMapping: "line-to-widget",
				timeMapping: "stretch",
				templateDuration: 3,
			},
		});

		const cover = await readJianyingTextStyleCover({ entry: solid! });
		expect(cover).toEqual(PNG_BYTES);
		expect(isValidJianyingTextStyleId({ styleId: solid!.styleId })).toBe(true);
		expect(isValidJianyingTextStyleId({ styleId: "../../private/style" })).toBe(
			false
		);
	});
});
