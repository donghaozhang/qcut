import { createHash } from "node:crypto";
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	CapCut81FontStackInspectionError,
	inspectCapCut81SystemFontStack,
	type CapCut81FontGlyphCoverageInspector,
} from "../capcut-8-1-system-font-stack.js";
import { inspectLoadedFontGlyphCoverage } from "../font-glyph-coverage.js";

const temporaryDirectories: string[] = [];

async function createFakeCapCutApp({
	bundleIdentifier = "com.lemon.lvoverseas",
	bundleVersion = "8.1.1",
	shortVersion = "8.1.1",
	writeChineseFont = true,
}: {
	bundleIdentifier?: string;
	bundleVersion?: string;
	shortVersion?: string;
	writeChineseFont?: boolean;
} = {}): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "qcut-capcut-font-stack-"));
	temporaryDirectories.push(root);
	const appPath = join(root, "CapCut.app");
	const contentsPath = join(appPath, "Contents");
	const fontPath = join(contentsPath, "Resources", "Font", "SystemFont");
	await Promise.all([
		mkdir(fontPath, { recursive: true }),
		mkdir(join(contentsPath, "MacOS"), { recursive: true }),
	]);
	const executablePath = join(contentsPath, "MacOS", "CapCut");
	await writeFile(executablePath, "fake-app-binary");
	await chmod(executablePath, 0o755);
	await writeFile(
		join(contentsPath, "Info.plist"),
		`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${bundleIdentifier}</string>
<key>CFBundleShortVersionString</key><string>${shortVersion}</string>
<key>CFBundleVersion</key><string>${bundleVersion}</string>
</dict></plist>`
	);
	await writeFile(join(fontPath, "en.ttf"), "fake-en-font");
	if (writeChineseFont) {
		await writeFile(join(fontPath, "zh-hans.ttf"), "fake-zh-font");
	}
	return appPath;
}

function createGlyphInspector({
	enCodePoints,
	zhCodePoints,
}: {
	enCodePoints: number[];
	zhCodePoints: number[];
}): CapCut81FontGlyphCoverageInspector {
	return async ({ fontPath, text }) => {
		const isEnglish = basename(fontPath) === "en.ttf";
		const supported = new Set(isEnglish ? enCodePoints : zhCodePoints);
		return inspectLoadedFontGlyphCoverage({
			font: {
				familyName: isEnglish ? "Fixture English" : "Fixture Chinese",
				fullName: isEnglish
					? "Fixture English Regular"
					: "Fixture Chinese Regular",
				hasGlyphForCodePoint: (codePoint) => supported.has(codePoint),
				postscriptName: isEnglish
					? "FixtureEnglish-Regular"
					: "FixtureChinese-Regular",
			},
			fontPath,
			text,
		});
	};
}

function sha256({ bytes }: { bytes: Buffer }): string {
	return createHash("sha256").update(bytes).digest("hex");
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("CapCut 8.1.1 system font stack inspection", () => {
	it("accepts the union of en.ttf and zh-hans.ttf cmap coverage", async () => {
		const capCutAppPath = await createFakeCapCutApp();
		const inspection = await inspectCapCut81SystemFontStack({
			capCutAppPath,
			inspectGlyphCoverage: createGlyphInspector({
				enCodePoints: [0x41],
				zhCodePoints: [0x526a],
			}),
			text: "A剪",
		});

		expect(inspection.missing).toEqual([]);
		expect(inspection.evidence.app).toMatchObject({
			bundleIdentifier: "com.lemon.lvoverseas",
			bundleVersion: "8.1.1",
			shortVersion: "8.1.1",
		});
		expect(inspection.evidence.fonts).toHaveLength(2);
		for (const font of inspection.evidence.fonts) {
			expect(font.bytes).toBeGreaterThan(0);
			expect(font.sha256).toMatch(/^[a-f0-9]{64}$/);
			expect(font.canonicalPath).toContain(capCutAppPath);
		}
	});

	it("binds cmap inspection and evidence to the same bytes when font paths mutate", async () => {
		const capCutAppPath = await createFakeCapCutApp();
		const fontDirectory = join(
			capCutAppPath,
			"Contents",
			"Resources",
			"Font",
			"SystemFont"
		);
		const originalBytes = new Map(
			await Promise.all(
				(["en.ttf", "zh-hans.ttf"] as const).map(
					async (fileName) =>
						[fileName, await readFile(join(fontDirectory, fileName))] as const
				)
			)
		);
		const inspectedBytes = new Map<string, Buffer>();
		const inspectGlyphCoverage: CapCut81FontGlyphCoverageInspector = async ({
			fontBytes,
			fontPath,
			text,
		}) => {
			const fileName = basename(fontPath);
			await writeFile(fontPath, `mutated-${fileName}`);
			inspectedBytes.set(fileName, Buffer.from(fontBytes));
			const supportedCodePoints = fileName === "en.ttf" ? [0x41] : [0x526a];
			return inspectLoadedFontGlyphCoverage({
				font: {
					familyName: `Fixture ${fileName}`,
					fullName: `Fixture ${fileName} Regular`,
					hasGlyphForCodePoint: (codePoint) =>
						supportedCodePoints.includes(codePoint),
					postscriptName: `Fixture-${fileName}`,
				},
				fontPath,
				text,
			});
		};

		const inspection = await inspectCapCut81SystemFontStack({
			capCutAppPath,
			inspectGlyphCoverage,
			text: "A剪",
		});

		expect(inspection.missing).toEqual([]);
		const currentDiskBytes = new Map(
			await Promise.all(
				inspection.evidence.fonts.map(
					async ({ canonicalPath, fileName }) =>
						[fileName, await readFile(canonicalPath)] as const
				)
			)
		);
		for (const evidence of inspection.evidence.fonts) {
			const expectedBytes = originalBytes.get(evidence.fileName);
			const actualBytes = inspectedBytes.get(evidence.fileName);
			expect(actualBytes).toEqual(expectedBytes);
			expect(evidence.sha256).toBe(
				sha256({ bytes: actualBytes ?? Buffer.alloc(0) })
			);
			expect(currentDiskBytes.get(evidence.fileName)).not.toEqual(actualBytes);
		}
	});

	it("reports a scalar only when both system fonts lack it", async () => {
		const capCutAppPath = await createFakeCapCutApp();
		const inspection = await inspectCapCut81SystemFontStack({
			capCutAppPath,
			inspectGlyphCoverage: createGlyphInspector({
				enCodePoints: [0x41],
				zhCodePoints: [0x526a],
			}),
			text: "A剪雪",
		});

		expect(inspection.missing).toEqual([
			{
				character: "雪",
				codePoint: 0x96ea,
				index: 2,
				unicode: "U+96EA",
			},
		]);
	});

	it("returns a typed error when a required system font is absent", async () => {
		const capCutAppPath = await createFakeCapCutApp({
			writeChineseFont: false,
		});

		await expect(
			inspectCapCut81SystemFontStack({
				capCutAppPath,
				inspectGlyphCoverage: createGlyphInspector({
					enCodePoints: [],
					zhCodePoints: [],
				}),
				text: "剪",
			})
		).rejects.toMatchObject({
			code: "CAPCUT_8_1_SYSTEM_FONT_INVALID",
			name: "CapCut81FontStackInspectionError",
		});
	});

	it("returns a typed error when the application bundle is absent", async () => {
		await expect(
			inspectCapCut81SystemFontStack({
				capCutAppPath: join(tmpdir(), "missing", "CapCut.app"),
				inspectGlyphCoverage: createGlyphInspector({
					enCodePoints: [],
					zhCodePoints: [],
				}),
				text: "剪",
			})
		).rejects.toMatchObject({
			code: "CAPCUT_8_1_APP_INVALID",
			name: "CapCut81FontStackInspectionError",
		});
	});

	it("rejects a non-executable application binary", async () => {
		const capCutAppPath = await createFakeCapCutApp();
		await chmod(join(capCutAppPath, "Contents", "MacOS", "CapCut"), 0o644);

		await expect(
			inspectCapCut81SystemFontStack({
				capCutAppPath,
				inspectGlyphCoverage: createGlyphInspector({
					enCodePoints: [],
					zhCodePoints: [],
				}),
				text: "剪",
			})
		).rejects.toMatchObject({
			code: "CAPCUT_8_1_APP_INVALID",
			message: expect.stringContaining("executable mode bit"),
		});
	});

	it.each([
		{
			expectedCode: "CAPCUT_8_1_APP_ID_MISMATCH",
			options: { bundleIdentifier: "invalid.bundle" },
		},
		{
			expectedCode: "CAPCUT_8_1_APP_VERSION_MISMATCH",
			options: { shortVersion: "8.1.2" },
		},
		{
			expectedCode: "CAPCUT_8_1_APP_VERSION_MISMATCH",
			options: { bundleVersion: "8.1.0" },
		},
	])("rejects an app identity mismatch: $expectedCode", async ({
		expectedCode,
		options,
	}) => {
		const capCutAppPath = await createFakeCapCutApp(options);

		await expect(
			inspectCapCut81SystemFontStack({
				capCutAppPath,
				inspectGlyphCoverage: createGlyphInspector({
					enCodePoints: [],
					zhCodePoints: [],
				}),
				text: "剪",
			})
		).rejects.toSatisfy(
			(error: unknown) =>
				error instanceof CapCut81FontStackInspectionError &&
				error.code === expectedCode
		);
	});
});
