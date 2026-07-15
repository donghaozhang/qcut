import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { createTestProject, expect, test } from "./helpers/electron-helpers";
import { importPortraitAuditFixtures } from "./helpers/portrait-audit-helpers";
import {
	missingPortraitAuditFixtures,
	portraitAuditFixtures,
	type AuditOrientation,
	type PortraitAuditFixture,
} from "./helpers/portrait-audit-fixtures";

const auditRoot = path.resolve(
	"output/playwright/portrait-filter-transition-audit"
);

const filterCategories = [
	"summer",
	"portrait",
	"landscape",
	"food",
	"camera",
	"night",
	"cinematic",
	"outdoor",
	"stylized",
	"monochrome",
	"hd",
	"film",
	"basic",
	"indoor",
] as const;

interface FilterApplication {
	presetId: string;
	presetVersion: number;
	intensity: number;
}

interface FilterAuditElement {
	id: string;
	mediaId: string;
	name: string;
	color?: { filter?: FilterApplication };
}

interface FilterAuditWindow extends Window {
	__mediaStore: {
		getState: () => {
			mediaItems: Array<{
				id: string;
				name: string;
				duration?: number;
			}>;
		};
	};
	__timelineStore: {
		getState: () => {
			tracks: Array<{
				id: string;
				type: string;
				isMain?: boolean;
				elements: FilterAuditElement[];
			}>;
			selectedElements: Array<{ trackId: string; elementId: string }>;
			addElementToTrack: (
				trackId: string,
				element: {
					type: "media";
					mediaId: string;
					name: string;
					duration: number;
					startTime: number;
					trimStart: number;
					trimEnd: number;
				}
			) => string | null;
			setSelectedElements: (
				selection: Array<{ trackId: string; elementId: string }>
			) => void;
		};
	};
	__playbackStore: {
		getState: () => { seek: (time: number) => void };
	};
}

interface CanvasMetrics {
	hash: number;
	opaqueSamples: number;
	lumaRange: number;
	width: number;
	height: number;
}

const unfilteredMetrics: CanvasMetrics = {
	hash: 0,
	opaqueSamples: 0,
	lumaRange: 0,
	width: 0,
	height: 0,
};

interface TimelineClipReference {
	elementId: string;
	fileName: string;
	startTime: number;
	trackId: string;
}

interface StressCase {
	fileName: string;
	filterId: string;
}

interface OrientationCase {
	orientation: AuditOrientation;
	primaryFileName: string;
	expectedWidth: number;
	expectedHeight: number;
	stressCases: StressCase[];
}

interface CategoryResult {
	category: string;
	presetIds: string[];
	finalMetrics: CanvasMetrics;
}

const orientationCases: OrientationCase[] = [
	{
		orientation: "portrait",
		primaryFileName: "colorful-influencer-10s.mp4",
		expectedWidth: 720,
		expectedHeight: 1280,
		stressCases: [
			{ fileName: "neon-man-10s.mp4", filterId: "night-blue" },
			{ fileName: "beach-woman-10s.mp4", filterId: "sunlight" },
		],
	},
	{
		orientation: "landscape",
		primaryFileName: "university-woman-landscape-10s.mp4",
		expectedWidth: 1280,
		expectedHeight: 720,
		stressCases: [
			{
				fileName: "office-woman-landscape-10s.mp4",
				filterId: "clarity-boost",
			},
			{
				fileName: "chroma-man-landscape-10s.mp4",
				filterId: "teal-gold",
			},
		],
	},
];

function fixturesForOrientation({
	orientation,
}: {
	orientation: AuditOrientation;
}) {
	return portraitAuditFixtures.filter(
		(fixture) => fixture.orientation === orientation
	);
}

function fileSlug({ fileName }: { fileName: string }) {
	return fileName.replace(/-10s\.mp4$/, "").replace(/\.mp4$/, "");
}

async function createTimelineClips({
	page,
	fixtures,
}: {
	page: Page;
	fixtures: PortraitAuditFixture[];
}) {
	return page.evaluate(
		({ fileNames }) => {
			const editorWindow = window as FilterAuditWindow;
			const mediaItems = editorWindow.__mediaStore.getState().mediaItems;
			const timeline = editorWindow.__timelineStore.getState();
			const track = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			if (!track) throw new Error("Missing main media track");
			const references: TimelineClipReference[] = [];
			for (const [index, fileName] of fileNames.entries()) {
				const media = mediaItems.find((item) => item.name === fileName);
				if (!media) throw new Error(`Missing imported fixture: ${fileName}`);
				const startTime = index * 3;
				const elementId = timeline.addElementToTrack(track.id, {
					type: "media",
					mediaId: media.id,
					name: media.name,
					duration: 3,
					startTime,
					trimStart: 0,
					trimEnd: 0,
				});
				if (!elementId) throw new Error(`Failed to add fixture: ${fileName}`);
				references.push({
					elementId,
					fileName,
					startTime,
					trackId: track.id,
				});
			}
			return references;
		},
		{ fileNames: fixtures.map((fixture) => fixture.fileName) }
	);
}

async function selectClip({
	page,
	clip,
	expectedWidth,
	expectedHeight,
}: {
	page: Page;
	clip: TimelineClipReference;
	expectedWidth: number;
	expectedHeight: number;
}) {
	await page.evaluate(
		({ trackId, elementId, time }) => {
			const editorWindow = window as FilterAuditWindow;
			editorWindow.__timelineStore
				.getState()
				.setSelectedElements([{ trackId, elementId }]);
			editorWindow.__playbackStore.getState().seek(time);
		},
		{
			trackId: clip.trackId,
			elementId: clip.elementId,
			time: clip.startTime + 1.25,
		}
	);
	const video = page.getByTestId("preview-panel").locator("video").first();
	await expect(video).toBeVisible();
	await expect
		.poll(() =>
			video.evaluate(
				(
					element: HTMLVideoElement,
					{ width, height }: { width: number; height: number }
				) =>
					element.readyState >= 2 &&
					element.videoWidth === width &&
					element.videoHeight === height,
				{ width: expectedWidth, height: expectedHeight }
			)
		)
		.toBe(true);
}

async function canvasMetrics({ page }: { page: Page }): Promise<CanvasMetrics> {
	return page
		.getByTestId("color-preview-canvas")
		.first()
		.evaluate((canvas) => {
			const output = canvas as HTMLCanvasElement;
			const context = output.getContext("2d", { willReadFrequently: true });
			if (!context || output.width === 0 || output.height === 0) {
				return {
					hash: 0,
					opaqueSamples: 0,
					lumaRange: 0,
					width: output.width,
					height: output.height,
				};
			}
			const pixels = context.getImageData(
				0,
				0,
				output.width,
				output.height
			).data;
			let hash = 2_166_136_261;
			let opaqueSamples = 0;
			let minimumLuma = 255;
			let maximumLuma = 0;
			for (let index = 0; index < pixels.length; index += 64) {
				if (pixels[index + 3] === 0) continue;
				const red = pixels[index];
				const green = pixels[index + 1];
				const blue = pixels[index + 2];
				const luma = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
				minimumLuma = Math.min(minimumLuma, luma);
				maximumLuma = Math.max(maximumLuma, luma);
				opaqueSamples += 1;
				hash ^= red;
				hash = Math.imul(hash, 16_777_619);
				hash ^= green;
				hash = Math.imul(hash, 16_777_619);
				hash ^= blue;
				hash = Math.imul(hash, 16_777_619);
			}
			return {
				hash: hash >>> 0,
				opaqueSamples,
				lumaRange: maximumLuma - minimumLuma,
				width: output.width,
				height: output.height,
			};
		});
}

async function activeFilterId({ page }: { page: Page }) {
	return page.evaluate(() => {
		const timeline = (window as FilterAuditWindow).__timelineStore.getState();
		const selected = timeline.selectedElements[0];
		const track = timeline.tracks.find(
			(candidate) => candidate.id === selected?.trackId
		);
		return track?.elements.find((element) => element.id === selected?.elementId)
			?.color?.filter?.presetId;
	});
}

async function applyVisibleCards({
	page,
	cards,
	index,
	previousMetrics,
	presetIds,
}: {
	page: Page;
	cards: Locator;
	index: number;
	previousMetrics: CanvasMetrics;
	presetIds: string[];
}): Promise<{ metrics: CanvasMetrics; presetIds: string[] }> {
	if (index >= (await cards.count())) {
		return { metrics: previousMetrics, presetIds };
	}
	const card = cards.nth(index);
	const testId = await card.getAttribute("data-testid");
	const presetId = testId?.replace("filter-card-", "");
	if (!presetId) throw new Error(`Filter card ${index} has no preset id`);
	await card.click();
	await expect.poll(() => activeFilterId({ page })).toBe(presetId);
	await expect
		.poll(async () => (await canvasMetrics({ page })).hash)
		.not.toBe(previousMetrics.hash);
	const metrics = await canvasMetrics({ page });
	expect(metrics.opaqueSamples, presetId).toBeGreaterThan(100);
	expect(metrics.lumaRange, presetId).toBeGreaterThan(5);
	return applyVisibleCards({
		page,
		cards,
		index: index + 1,
		previousMetrics: metrics,
		presetIds: [...presetIds, presetId],
	});
}

async function auditFilterCategories({
	page,
	outputDirectory,
	categoryIndex,
	previousMetrics,
	results,
}: {
	page: Page;
	outputDirectory: string;
	categoryIndex: number;
	previousMetrics: CanvasMetrics;
	results: CategoryResult[];
}): Promise<CategoryResult[]> {
	if (categoryIndex >= filterCategories.length) return results;
	const category = filterCategories[categoryIndex];
	const filters = page.getByTestId("filters-view");
	await filters.getByTestId(`filter-category-${category}`).click();
	const cards = filters.locator('[data-testid^="filter-card-"]');
	await expect(cards).toHaveCount(4);
	const applied = await applyVisibleCards({
		page,
		cards,
		index: 0,
		previousMetrics,
		presetIds: [],
	});
	await page.screenshot({
		path: path.join(
			outputDirectory,
			`${String(categoryIndex + 1).padStart(2, "0")}-${category}.png`
		),
		animations: "disabled",
	});
	return auditFilterCategories({
		page,
		outputDirectory,
		categoryIndex: categoryIndex + 1,
		previousMetrics: applied.metrics,
		results: [
			...results,
			{
				category,
				presetIds: applied.presetIds,
				finalMetrics: applied.metrics,
			},
		],
	});
}

async function auditStressCases({
	page,
	outputDirectory,
	clips,
	auditCase,
	stressIndex,
	results,
}: {
	page: Page;
	outputDirectory: string;
	clips: TimelineClipReference[];
	auditCase: OrientationCase;
	stressIndex: number;
	results: Array<{
		fileName: string;
		filterId: string;
		metrics: CanvasMetrics;
	}>;
}): Promise<
	Array<{ fileName: string; filterId: string; metrics: CanvasMetrics }>
> {
	if (stressIndex >= auditCase.stressCases.length) return results;
	const stressCase = auditCase.stressCases[stressIndex];
	const clip = clips.find(
		(candidate) => candidate.fileName === stressCase.fileName
	);
	if (!clip) throw new Error(`Missing stress clip: ${stressCase.fileName}`);
	await selectClip({
		page,
		clip,
		expectedWidth: auditCase.expectedWidth,
		expectedHeight: auditCase.expectedHeight,
	});
	const baseline = unfilteredMetrics;
	const filters = page.getByTestId("filters-view");
	await filters.getByTestId("filter-category-all").click();
	await filters.getByTestId(`filter-card-${stressCase.filterId}`).click();
	await expect.poll(() => activeFilterId({ page })).toBe(stressCase.filterId);
	await expect
		.poll(async () => (await canvasMetrics({ page })).hash)
		.not.toBe(baseline.hash);
	const metrics = await canvasMetrics({ page });
	expect(metrics.opaqueSamples).toBeGreaterThan(100);
	expect(metrics.lumaRange).toBeGreaterThan(5);
	await page.screenshot({
		path: path.join(
			outputDirectory,
			`stress-${String(stressIndex + 1).padStart(2, "0")}-${fileSlug({ fileName: stressCase.fileName })}-${stressCase.filterId}.png`
		),
		animations: "disabled",
	});
	return auditStressCases({
		page,
		outputDirectory,
		clips,
		auditCase,
		stressIndex: stressIndex + 1,
		results: [
			...results,
			{
				fileName: stressCase.fileName,
				filterId: stressCase.filterId,
				metrics,
			},
		],
	});
}

async function runOrientationAudit({
	page,
	auditCase,
}: {
	page: Page;
	auditCase: OrientationCase;
}) {
	const outputDirectory = path.join(
		auditRoot,
		`run-02-filters-${auditCase.orientation}`
	);
	await rm(outputDirectory, { recursive: true, force: true });
	await mkdir(outputDirectory, { recursive: true });
	await createTestProject(
		page,
		`Portrait Filter Audit - ${auditCase.orientation}`
	);
	const fixtures = fixturesForOrientation({
		orientation: auditCase.orientation,
	});
	await importPortraitAuditFixtures({ page, fixtures });
	const clips = await createTimelineClips({ page, fixtures });
	const primaryClip = clips.find(
		(clip) => clip.fileName === auditCase.primaryFileName
	);
	if (!primaryClip) throw new Error("Missing primary filter audit clip");
	await selectClip({
		page,
		clip: primaryClip,
		expectedWidth: auditCase.expectedWidth,
		expectedHeight: auditCase.expectedHeight,
	});
	await page.getByTestId("filters-panel-tab").click();
	await expect(page.getByTestId("filters-view")).toBeVisible();
	const baseline = unfilteredMetrics;
	const categories = await auditFilterCategories({
		page,
		outputDirectory,
		categoryIndex: 0,
		previousMetrics: baseline,
		results: [],
	});
	const appliedPresetIds = categories.flatMap((category) => category.presetIds);
	expect(appliedPresetIds).toHaveLength(56);
	expect(new Set(appliedPresetIds).size).toBe(56);
	const stressCases = await auditStressCases({
		page,
		outputDirectory,
		clips,
		auditCase,
		stressIndex: 0,
		results: [],
	});
	await writeFile(
		path.join(outputDirectory, "manifest.json"),
		`${JSON.stringify(
			{
				orientation: auditCase.orientation,
				primaryFileName: auditCase.primaryFileName,
				baseline,
				categories,
				stressCases,
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

test.describe("Real portrait filter audit", () => {
	test("applies all 56 filters to portrait footage and inspects lighting stress cases", async ({
		electronApp,
		page,
	}) => {
		test.setTimeout(360_000);
		await electronApp.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows()[0]?.setBounds({
				x: 20,
				y: 20,
				width: 1800,
				height: 1040,
			});
		});
		await runOrientationAudit({ page, auditCase: orientationCases[0] });
	});

	test("applies all 56 filters to landscape footage and inspects skin and edge stress cases", async ({
		electronApp,
		page,
	}) => {
		test.setTimeout(360_000);
		await electronApp.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows()[0]?.setBounds({
				x: 20,
				y: 20,
				width: 1800,
				height: 1040,
			});
		});
		await runOrientationAudit({ page, auditCase: orientationCases[1] });
	});
});
