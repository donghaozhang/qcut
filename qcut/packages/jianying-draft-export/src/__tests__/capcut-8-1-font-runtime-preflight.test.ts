import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type {
	CaptionElement,
	TextElement,
	TimelineTrack,
} from "@qcut/editor-core";
import type { QCutDraftExportSnapshotV1 } from "@qcut/editor-core/jianying-draft";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockedWriter = vi.hoisted(() => ({
	write: vi.fn(() => Promise.reject(new Error("writer should not run"))),
}));

vi.mock("../capcut-8-1-migration-writer.js", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("../capcut-8-1-migration-writer.js")>();
	return {
		...original,
		writeTrustedCapCut81MigrationBundle: mockedWriter.write,
	};
});

import {
	CapCut81MigrationExportSession,
	CapCut81MigrationPlanStateChangedError,
	type CapCut81FontGlyphCoverageInspector,
} from "../index.js";
import { inspectLoadedFontGlyphCoverage } from "../font-glyph-coverage.js";

const temporaryDirectories: string[] = [];

interface FakeApp {
	appPath: string;
	enFontPath: string;
}

async function createFakeCapCutApp({
	bundleIdentifier = "com.lemon.lvoverseas",
}: {
	bundleIdentifier?: string;
} = {}): Promise<FakeApp> {
	const root = await mkdtemp(join(tmpdir(), "qcut-capcut-runtime-font-"));
	temporaryDirectories.push(root);
	const appPath = join(root, "CapCut.app");
	const contentsPath = join(appPath, "Contents");
	const fontDirectory = join(contentsPath, "Resources", "Font", "SystemFont");
	await Promise.all([
		mkdir(fontDirectory, { recursive: true }),
		mkdir(join(contentsPath, "MacOS"), { recursive: true }),
	]);
	const executablePath = join(contentsPath, "MacOS", "CapCut");
	await writeFile(executablePath, "runtime-app-binary");
	await chmod(executablePath, 0o755);
	await writeFile(
		join(contentsPath, "Info.plist"),
		`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${bundleIdentifier}</string>
<key>CFBundleShortVersionString</key><string>8.1.1</string>
<key>CFBundleVersion</key><string>8.1.1</string>
</dict></plist>`
	);
	const enFontPath = join(fontDirectory, "en.ttf");
	await writeFile(enFontPath, "runtime-en-font");
	await writeFile(join(fontDirectory, "zh-hans.ttf"), "runtime-zh-font");
	return { appPath, enFontPath };
}

function createGlyphInspector({
	enCodePoints,
	zhCodePoints,
}: {
	enCodePoints: number[];
	zhCodePoints: number[];
}): CapCut81FontGlyphCoverageInspector {
	return ({ fontPath, text }) => {
		const isEnglish = basename(fontPath) === "en.ttf";
		const supported = new Set(isEnglish ? enCodePoints : zhCodePoints);
		return Promise.resolve(
			inspectLoadedFontGlyphCoverage({
				font: {
					familyName: isEnglish ? "Runtime English" : "Runtime Chinese",
					fullName: isEnglish
						? "Runtime English Regular"
						: "Runtime Chinese Regular",
					hasGlyphForCodePoint: (codePoint) => supported.has(codePoint),
					postscriptName: isEnglish
						? "RuntimeEnglish-Regular"
						: "RuntimeChinese-Regular",
				},
				fontPath,
				text,
			})
		);
	};
}

function createTextElement({
	content = "A剪",
	fontFamily = "Arial",
	hidden = false,
}: {
	content?: string;
	fontFamily?: string;
	hidden?: boolean;
} = {}): TextElement {
	return {
		backgroundColor: "transparent",
		color: "#ffffff",
		content,
		duration: 3,
		fontFamily,
		fontSize: 64,
		fontStyle: "normal",
		fontWeight: "normal",
		hidden,
		id: "text-1",
		name: "text-1",
		opacity: 1,
		rotation: 0,
		startTime: 0,
		textAlign: "center",
		textDecoration: "none",
		trimEnd: 0,
		trimStart: 0,
		type: "text",
		x: 0,
		y: 0,
	};
}

function createCaptionElement(): CaptionElement {
	return {
		duration: 3,
		id: "caption-1",
		language: "zh-CN",
		name: "caption-1",
		source: "manual",
		startTime: 0,
		text: "A剪",
		trimEnd: 0,
		trimStart: 0,
		type: "captions",
	};
}

function createSnapshot({
	caption,
	text,
}: {
	caption?: CaptionElement;
	text?: TextElement;
} = {}): QCutDraftExportSnapshotV1 {
	const tracks: TimelineTrack[] = [];
	if (text) {
		tracks.push({
			elements: [text],
			id: "text-track",
			name: "Text",
			type: "text",
		});
	}
	if (caption) {
		tracks.push({
			elements: [caption],
			id: "caption-track",
			name: "Captions",
			type: "captions",
		});
	}
	return {
		media: [],
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project",
			name: "Runtime font preflight",
			sceneId: "scene",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {},
		tracks,
	};
}

async function createSession({
	capCutAppPath,
	inspectFontGlyphCoverage,
}: {
	capCutAppPath?: string;
	inspectFontGlyphCoverage?: CapCut81FontGlyphCoverageInspector;
} = {}): Promise<CapCut81MigrationExportSession> {
	const outputParentDirectory = await mkdtemp(
		join(tmpdir(), "qcut-capcut-runtime-output-")
	);
	temporaryDirectories.push(outputParentDirectory);
	return new CapCut81MigrationExportSession({
		...(capCutAppPath === undefined ? {} : { capCutAppPath }),
		ffprobePath: "/trusted/ffprobe-8",
		...(inspectFontGlyphCoverage === undefined
			? {}
			: { inspectFontGlyphCoverage }),
		outputParentDirectory,
	});
}

async function planSnapshot({
	session,
	snapshot,
}: {
	session: CapCut81MigrationExportSession;
	snapshot: QCutDraftExportSnapshotV1;
}) {
	return session.plan({
		input: {
			draftName: "Runtime font preflight",
			snapshot,
			targetPlatform: "macos",
		},
	});
}

afterEach(async () => {
	mockedWriter.write.mockClear();
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("CapCut migration runtime font preflight", () => {
	it("blocks visible native text and captions without a trusted app path", async () => {
		const session = await createSession();
		const plan = await planSnapshot({
			session,
			snapshot: createSnapshot({
				caption: createCaptionElement(),
				text: createTextElement(),
			}),
		});

		expect(plan.canCommit).toBe(false);
		expect(
			plan.issues.filter(
				({ code }) => code === "CAPCUT_8_1_FONT_APP_PATH_REQUIRED"
			)
		).toEqual([
			expect.objectContaining({
				elementId: "text-1",
				trackId: "text-track",
			}),
			expect.objectContaining({
				elementId: "caption-1",
				trackId: "caption-track",
			}),
		]);
	});

	it("binds app and font evidence when the two-font union covers content", async () => {
		const app = await createFakeCapCutApp();
		const session = await createSession({
			capCutAppPath: app.appPath,
			inspectFontGlyphCoverage: createGlyphInspector({
				enCodePoints: [0x41],
				zhCodePoints: [0x526a],
			}),
		});
		const plan = await planSnapshot({
			session,
			snapshot: createSnapshot({ text: createTextElement() }),
		});

		expect(plan.canCommit).toBe(true);
		expect(plan.issues).toContainEqual(
			expect.objectContaining({
				code: "CAPCUT_8_1_FONT_STACK_VERIFIED",
				message: expect.stringContaining(app.appPath),
				severity: "info",
			})
		);
		expect(plan.issues).not.toContainEqual(
			expect.objectContaining({ code: "CAPCUT_8_1_FONT_GLYPH_MISSING" })
		);
	});

	it("binds a missing union glyph to its element and track", async () => {
		const app = await createFakeCapCutApp();
		const session = await createSession({
			capCutAppPath: app.appPath,
			inspectFontGlyphCoverage: createGlyphInspector({
				enCodePoints: [],
				zhCodePoints: [],
			}),
		});
		const plan = await planSnapshot({
			session,
			snapshot: createSnapshot({
				text: createTextElement({ content: "雪" }),
			}),
		});

		expect(plan.canCommit).toBe(false);
		expect(plan.issues).toContainEqual(
			expect.objectContaining({
				code: "CAPCUT_8_1_FONT_GLYPH_MISSING",
				elementId: "text-1",
				message: expect.stringContaining("U+96EA"),
				severity: "error",
				trackId: "text-track",
			})
		);
	});

	it("reports app identity failures with text ownership context", async () => {
		const app = await createFakeCapCutApp({
			bundleIdentifier: "invalid.bundle",
		});
		const session = await createSession({
			capCutAppPath: app.appPath,
			inspectFontGlyphCoverage: createGlyphInspector({
				enCodePoints: [],
				zhCodePoints: [],
			}),
		});
		const plan = await planSnapshot({
			session,
			snapshot: createSnapshot({ text: createTextElement() }),
		});

		expect(plan.issues).toContainEqual(
			expect.objectContaining({
				code: "CAPCUT_8_1_APP_ID_MISMATCH",
				elementId: "text-1",
				trackId: "text-track",
			})
		);
	});

	it("skips hidden and core-rejected explicit-font elements", async () => {
		const session = await createSession({
			capCutAppPath: "/missing/CapCut.app",
		});
		const hiddenPlan = await planSnapshot({
			session,
			snapshot: createSnapshot({
				text: createTextElement({ hidden: true }),
			}),
		});
		const explicitPlan = await planSnapshot({
			session,
			snapshot: createSnapshot({
				text: createTextElement({ fontFamily: "Inter" }),
			}),
		});

		for (const plan of [hiddenPlan, explicitPlan]) {
			expect(plan.issues).not.toContainEqual(
				expect.objectContaining({ code: "CAPCUT_8_1_APP_INVALID" })
			);
		}
		expect(explicitPlan.issues).toContainEqual(
			expect.objectContaining({ code: "UNVERIFIED_CAPCUT_EXPLICIT_FONT" })
		);
	});

	it("turns a plan-to-commit font mutation into PlanStateChanged", async () => {
		const app = await createFakeCapCutApp();
		const session = await createSession({
			capCutAppPath: app.appPath,
			inspectFontGlyphCoverage: createGlyphInspector({
				enCodePoints: [0x41],
				zhCodePoints: [],
			}),
		});
		const plan = await planSnapshot({
			session,
			snapshot: createSnapshot({
				text: createTextElement({ content: "A" }),
			}),
		});
		await writeFile(app.enFontPath, "runtime-en-font-mutated");

		await expect(
			session.commit({
				input: {
					acceptedWarningFingerprints: plan.warningFingerprints,
					planToken: plan.planToken,
				},
			})
		).rejects.toBeInstanceOf(CapCut81MigrationPlanStateChangedError);
		expect(mockedWriter.write).not.toHaveBeenCalled();
	});

	it("leaves plans without exportable text independent of CapCut", async () => {
		const session = await createSession();
		const plan = await planSnapshot({
			session,
			snapshot: createSnapshot(),
		});

		expect(plan.canCommit).toBe(true);
		expect(plan.issues).toEqual([]);
	});
});
