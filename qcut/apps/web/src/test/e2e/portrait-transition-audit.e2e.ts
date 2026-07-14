import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import {
	TRANSITION_CONTENT_CATEGORIES,
	transitionPresets,
	type TransitionContentCategory,
	type TransitionPreset,
} from "../../components/editor/media-panel/views/transitions/transition-presets";
import { createTestProject, expect, test } from "./helpers/electron-helpers";
import { importPortraitAuditFixtures } from "./helpers/portrait-audit-helpers";
import {
	missingPortraitAuditFixtures,
	portraitAuditFixtures,
	type PortraitAuditFixture,
} from "./helpers/portrait-audit-fixtures";
import {
	applyTransitionPreset,
	createTransitionSeam,
	selectTransitionSeam,
	type SeamReference,
	type TransitionPresetResult,
	type TransitionSeamInput,
	verifyTransitionCardPreview,
} from "./helpers/portrait-transition-audit-helpers";

const auditRoot = path.resolve(
	"output/playwright/portrait-filter-transition-audit"
);

interface CategoryResult {
	category: TransitionContentCategory;
	presetIds: string[];
	visualPresetId: string;
	screenshot: string;
}

interface CategorySpec {
	id: TransitionContentCategory;
	label: string;
	visualPresetId: string;
}

interface SeamAuditCase extends TransitionSeamInput {
	id: "portrait-to-landscape" | "landscape-to-portrait";
}

const categorySpecs: CategorySpec[] = [
	{ id: "dissolve", label: "叠化", visualPresetId: "soft-dissolve" },
	{ id: "natural", label: "自然", visualPresetId: "fade-to-white" },
	{ id: "slideshow", label: "幻灯片", visualPresetId: "page-turn-left" },
	{ id: "split", label: "分割", visualPresetId: "push-down" },
	{ id: "blur", label: "模糊", visualPresetId: "deep-zoom-blur" },
	{ id: "camera", label: "运镜", visualPresetId: "impact-shake" },
	{ id: "shooting", label: "拍摄", visualPresetId: "shutter-flash" },
	{ id: "distortion", label: "扭曲", visualPresetId: "chromatic-twist" },
	{ id: "light", label: "光效", visualPresetId: "film-burn" },
	{ id: "glitch", label: "故障", visualPresetId: "heavy-glitch" },
	{ id: "variety", label: "综艺", visualPresetId: "variety-bounce" },
	{ id: "mg", label: "MG 动画", visualPresetId: "elastic-whip" },
	{ id: "emoji", label: "互动 emoji", visualPresetId: "star-bounce" },
];

const seamAuditCases: SeamAuditCase[] = [
	{
		id: "portrait-to-landscape",
		fromFileName: "colorful-influencer-10s.mp4",
		toFileName: "university-woman-landscape-10s.mp4",
		clipDuration: 4,
		expectedDimensions: [
			{ width: 720, height: 1280 },
			{ width: 1280, height: 720 },
		],
	},
	{
		id: "landscape-to-portrait",
		fromFileName: "office-woman-landscape-10s.mp4",
		toFileName: "neon-man-10s.mp4",
		clipDuration: 4,
		expectedDimensions: [
			{ width: 1280, height: 720 },
			{ width: 720, height: 1280 },
		],
	},
];

function fixturesForCase({
	auditCase,
}: {
	auditCase: SeamAuditCase;
}): PortraitAuditFixture[] {
	const fileNames = new Set([auditCase.fromFileName, auditCase.toFileName]);
	return portraitAuditFixtures.filter((fixture) =>
		fileNames.has(fixture.fileName)
	);
}

async function auditPresetCards({
	page,
	seam,
	auditCase,
	presets,
	container,
	visualPresetId,
	outputDirectory,
	categoryIndex,
	presetIndex,
	results,
}: {
	page: Page;
	seam: SeamReference;
	auditCase: SeamAuditCase;
	presets: TransitionPreset[];
	container: Locator;
	visualPresetId: string;
	outputDirectory: string;
	categoryIndex: number;
	presetIndex: number;
	results: TransitionPresetResult[];
}): Promise<TransitionPresetResult[]> {
	if (presetIndex >= presets.length) return results;
	const preset = presets[presetIndex];
	const card = container.getByTestId(`transition-card-${preset.id}`);
	await expect(card).toBeVisible();
	if (preset.id === visualPresetId) {
		await verifyTransitionCardPreview({ card });
	}
	const result = await applyTransitionPreset({
		page,
		seam,
		preset,
		card,
		expectedDimensions: auditCase.expectedDimensions,
	});
	if (preset.id === visualPresetId) {
		await page.screenshot({
			path: path.join(
				outputDirectory,
				`${String(categoryIndex + 1).padStart(2, "0")}-${preset.category}-${preset.id}.png`
			),
			animations: "disabled",
		});
	}
	return auditPresetCards({
		page,
		seam,
		auditCase,
		presets,
		container,
		visualPresetId,
		outputDirectory,
		categoryIndex,
		presetIndex: presetIndex + 1,
		results: [...results, result],
	});
}

async function auditCategories({
	page,
	seam,
	auditCase,
	outputDirectory,
	categoryIndex,
	results,
}: {
	page: Page;
	seam: SeamReference;
	auditCase: SeamAuditCase;
	outputDirectory: string;
	categoryIndex: number;
	results: CategoryResult[];
}): Promise<CategoryResult[]> {
	if (categoryIndex >= categorySpecs.length) return results;
	const spec = categorySpecs[categoryIndex];
	const presets = transitionPresets.filter(
		(preset) => preset.category === spec.id
	);
	const transitionsView = page.getByTestId("transitions-view");
	await transitionsView
		.getByRole("button", { name: spec.label, exact: true })
		.click();
	const cards = transitionsView.locator('[data-testid^="transition-card-"]');
	await expect(cards).toHaveCount(presets.length);
	const presetResults = await auditPresetCards({
		page,
		seam,
		auditCase,
		presets,
		container: transitionsView,
		visualPresetId: spec.visualPresetId,
		outputDirectory,
		categoryIndex,
		presetIndex: 0,
		results: [],
	});
	return auditCategories({
		page,
		seam,
		auditCase,
		outputDirectory,
		categoryIndex: categoryIndex + 1,
		results: [
			...results,
			{
				category: spec.id,
				presetIds: presetResults.map((result) => result.presetId),
				visualPresetId: spec.visualPresetId,
				screenshot: `${String(categoryIndex + 1).padStart(2, "0")}-${spec.id}-${spec.visualPresetId}.png`,
			},
		],
	});
}

async function runSeamAudit({
	page,
	auditCase,
}: {
	page: Page;
	auditCase: SeamAuditCase;
}) {
	const outputDirectory = path.join(
		auditRoot,
		`run-04-transitions-${auditCase.id}`
	);
	await rm(outputDirectory, { recursive: true, force: true });
	await mkdir(outputDirectory, { recursive: true });
	await createTestProject(page, `Portrait Transition Audit - ${auditCase.id}`);
	const fixtures = fixturesForCase({ auditCase });
	expect(fixtures).toHaveLength(2);
	await importPortraitAuditFixtures({ page, fixtures });
	const seam = await createTransitionSeam({ page, input: auditCase });
	await selectTransitionSeam({ page, seam });
	await page.getByTestId("transitions-panel-tab").click();
	await expect(page.getByTestId("transitions-view")).toBeVisible();
	expect(categorySpecs.map((spec) => spec.id)).toEqual([
		...TRANSITION_CONTENT_CATEGORIES,
	]);
	const categories = await auditCategories({
		page,
		seam,
		auditCase,
		outputDirectory,
		categoryIndex: 0,
		results: [],
	});
	const appliedPresetIds = categories.flatMap((category) => category.presetIds);
	expect(appliedPresetIds).toHaveLength(transitionPresets.length);
	expect(new Set(appliedPresetIds).size).toBe(transitionPresets.length);
	await writeFile(
		path.join(outputDirectory, "manifest.json"),
		`${JSON.stringify(
			{
				seam: auditCase,
				registeredPresetCount: transitionPresets.length,
				categories,
			},
			null,
			2
		)}\n`
	);
}

test.skip(
	missingPortraitAuditFixtures().length > 0,
	"Portrait audit fixtures are missing; set QCUT_PORTRAIT_AUDIT_DIR"
);

test.describe("Real portrait transition audit", () => {
	for (const auditCase of seamAuditCases) {
		test(`applies all registered transitions at the ${auditCase.id} seam`, async ({
			electronApp,
			page,
		}) => {
			test.setTimeout(900_000);
			await electronApp.evaluate(({ BrowserWindow }) => {
				BrowserWindow.getAllWindows()[0]?.setBounds({
					x: 20,
					y: 20,
					width: 1800,
					height: 1040,
				});
			});
			await runSeamAudit({ page, auditCase });
		});
	}
});
