import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	expect,
	test,
	_electron as electron,
	type Page,
} from "@playwright/test";
import {
	createTestProject,
	navigateToProjects,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const newlySupportedDualLutFilters = [
	{ resourceId: "7330581892510649636", title: "鲜美" },
	{ resourceId: "7341266486536768831", title: "黑金红" },
	{ resourceId: "7403664465390013735", title: "美食增色" },
	{ resourceId: "7411477748130139403", title: "夜景增色II" },
	{ resourceId: "7341300292148907327", title: "蓝金" },
	{ resourceId: "7211008985187487036", title: "花间" },
	{ resourceId: "7145394266209127694", title: "银蓝" },
	{ resourceId: "7302338645938261287", title: "超白" },
	{ resourceId: "7485292050917657906", title: "佳能G12" },
] as const;
const expandedFilters = [
	{ resourceId: "7431187754379136266", title: "高清暖调" },
	{ resourceId: "7473437502787816740", title: "去雾" },
	{ resourceId: "7320436048134147340", title: "高清" },
	{ resourceId: "7426668776491453707", title: "高清增强" },
	{ resourceId: "7325426821267295551", title: "高清II" },
	...newlySupportedDualLutFilters,
] as const;
const primaryFilter = newlySupportedDualLutFilters[0];
const privateRuntimeRoot = join(
	homedir(),
	"Library",
	"Application Support",
	"QCut",
	"PrivateRuntimes",
	"JianyingFilter",
	"current"
);
const privateCacheRoot = join(privateRuntimeRoot, "Cache");
const portraitSourcePath =
	process.env.QCUT_JIANYING_FILTER_LAB_SOURCE ??
	join(
		process.cwd(),
		"output",
		"playwright",
		"portrait-filter-transition-audit",
		"sources",
		"colorful-influencer-10s.mp4"
	);
const evidenceDirectory =
	process.env.QCUT_JIANYING_FILTER_PRIVATE_E2E_EVIDENCE ??
	join(
		homedir(),
		"Library",
		"Application Support",
		"QCut",
		"Research",
		"JianyingFilter",
		"private-runtime-offline",
		new Date().toISOString().slice(0, 10),
		"ui"
	);
const enabled =
	existsSync(join(privateRuntimeRoot, "manifest.json")) &&
	existsSync(join(privateRuntimeRoot, "Frameworks", "libcccreator.dylib")) &&
	existsSync(portraitSourcePath);

type TestTimelineStore = {
	getState: () => {
		tracks: Array<{
			elements: Array<{
				type: string;
				color?: {
					lut?: {
						name?: string;
						cube?: { size: number; values: number[] };
						dual?: {
							maskKind?: string;
							resourceId?: string;
							skinCube?: { size: number; values: number[] };
						};
					};
				};
			}>;
		}>;
	};
};

async function addVideo({ page }: { page: Page }) {
	const mediaItem = page.getByTestId("media-item").first();
	await expect(mediaItem).toBeVisible();
	await mediaItem.hover();
	await mediaItem.locator("button").first().click({ force: true });
	const clip = page.locator(
		'[data-testid="timeline-track"][data-track-type="media"] [data-testid="timeline-element"]'
	);
	await expect(clip).toHaveCount(1);
	await clip.click();
}

async function adjustmentLutState({ page }: { page: Page }) {
	return page.evaluate(() => {
		const timeline = (
			window as unknown as { __timelineStore: TestTimelineStore }
		).__timelineStore.getState();
		const lut = timeline.tracks
			.flatMap(({ elements }) => elements)
			.find(({ type }) => type === "adjustment")?.color?.lut;
		return {
			name: lut?.name,
			size: lut?.cube?.size,
			values: lut?.cube?.values.length,
			skinSize: lut?.dual?.skinCube?.size,
			skinValues: lut?.dual?.skinCube?.values.length,
			maskKind: lut?.dual?.maskKind,
			resourceId: lut?.dual?.resourceId,
		};
	});
}

async function renderCurrentFrame({
	page,
	resourceId,
}: {
	page: Page;
	resourceId: string;
}) {
	return page.evaluate(
		async ({ selectedResourceId }) => {
			const video = document.querySelector<HTMLVideoElement>(
				'[data-testid="preview-capture-surface"] video[data-video-id]'
			);
			const api = window.electronAPI?.jianyingFilterLab;
			if (!video || video.videoWidth === 0 || video.videoHeight === 0 || !api) {
				throw new Error("Preview video or Filter Lab API unavailable");
			}
			const width = 320;
			const height = Math.max(
				1,
				Math.round((width * video.videoHeight) / video.videoWidth)
			);
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext("2d", { willReadFrequently: true });
			if (!context) throw new Error("Canvas context unavailable");
			context.drawImage(video, 0, 0, width, height);
			const source = context.getImageData(0, 0, width, height);
			const rendered = await api.renderLocalPortrait({
				resourceId: selectedResourceId,
				width,
				height,
				sourceKey: `private-runtime-e2e:${selectedResourceId}`,
				timestampSeconds: video.currentTime,
				rgba: new Uint8Array(
					source.data.buffer,
					source.data.byteOffset,
					source.data.byteLength
				),
			});
			let maskMaximum = 0;
			for (const value of rendered.mask.bytes) {
				maskMaximum = Math.max(maskMaximum, value);
			}
			let changedChannels = 0;
			for (let index = 0; index < rendered.rgba.length; index += 4) {
				for (let channel = 0; channel < 3; channel += 1) {
					if (rendered.rgba[index + channel] !== source.data[index + channel]) {
						changedChannels += 1;
					}
				}
			}
			return {
				provider: rendered.provider,
				resourceId: rendered.resourceId,
				width: rendered.width,
				height: rendered.height,
				maskWidth: rendered.mask.width,
				maskHeight: rendered.mask.height,
				maskMaximum,
				changedChannels,
			};
		},
		{ selectedResourceId: resourceId }
	);
}

async function loadFilterLuts({
	page,
	lutIds,
}: {
	page: Page;
	lutIds: string[];
}) {
	return page.evaluate(
		async ({ selectedLutIds }) => {
			const api = window.electronAPI?.jianyingFilterLab;
			if (!api) throw new Error("Filter Lab API unavailable");
			const loaded = await Promise.all(
				selectedLutIds.map((lutId) => api.load({ lutId }))
			);
			return loaded.map(({ role, cube }) => ({
				role,
				size: cube.size,
				values: cube.values.length,
			}));
		},
		{ selectedLutIds: lutIds }
	);
}

async function previewPixelCount({ page }: { page: Page }) {
	return page
		.getByTestId("color-preview-canvas")
		.first()
		.evaluate((canvas: HTMLCanvasElement) => {
			const context = canvas.getContext("2d");
			if (!context || canvas.width === 0 || canvas.height === 0) return 0;
			const pixels = context.getImageData(
				0,
				0,
				canvas.width,
				canvas.height
			).data;
			let count = 0;
			for (let index = 0; index < pixels.length; index += 64) {
				if (
					pixels[index] > 3 ||
					pixels[index + 1] > 3 ||
					pixels[index + 2] > 3
				) {
					count += 1;
				}
			}
			return count;
		});
}

test.describe("Jianying Filter Lab private runtime", () => {
	test.skip(
		!enabled,
		"Requires the QCut private runtime snapshot and portrait source"
	);

	// biome-ignore lint/correctness/noEmptyPattern: the test launches its own isolated Electron process.
	test("runs an expanded portrait filter without Jianying paths", async ({}) => {
		test.setTimeout(240_000);
		const profileDirectory = join(
			tmpdir(),
			`qcut-filter-private-${process.pid}-${Date.now()}`
		);
		await rm(evidenceDirectory, { recursive: true, force: true });
		await mkdir(evidenceDirectory, { recursive: true });
		const electronApp = await electron.launch({
			args: [`--user-data-dir=${profileDirectory}`, "dist/electron/main.js"],
			cwd: process.cwd(),
			env: {
				...process.env,
				NODE_ENV: "test",
				QCUT_JIANYING_DISABLE_APP_BUNDLE: "1",
				QCUT_JIANYING_DISABLE_USER_CACHE: "1",
				QCUT_JIANYING_FILTER_CACHE_ROOT: privateCacheRoot,
			},
		});

		try {
			const page = await electronApp.firstWindow();
			await page.waitForLoadState("domcontentloaded");
			await page.waitForFunction(
				() => Boolean(document.querySelector("#root")?.children.length),
				undefined,
				{ timeout: 30_000 }
			);
			await page.evaluate(() =>
				localStorage.setItem("hasSeenOnboarding", "true")
			);
			await navigateToProjects(page);
			await createTestProject(page, "Private Filter Runtime E2E");
			await uploadTestMedia(page, portraitSourcePath);
			await addVideo({ page });

			await page.getByTestId("filters-panel-tab").click();
			await expect(page.getByTestId("filters-view")).toBeVisible();
			await page.getByRole("button", { name: "滤镜实验室" }).click();
			const lab = page.getByTestId("jianying-filter-lab");
			await expect(lab).toBeVisible();
			await expect(
				lab.getByTestId("jianying-filter-runtime-status")
			).toContainText("QCut 离线运行已就绪", { timeout: 120_000 });

			const runtime = await page.evaluate(() =>
				window.electronAPI?.jianyingFilterLab?.inspectLocalRuntime({
					refresh: true,
				})
			);
			expect(runtime).toMatchObject({
				state: "ready",
				runtimeSource: "qcut-private",
				modelSource: "qcut-private",
				snapshotReady: true,
				offlineReady: true,
			});
			await lab.getByRole("button", { name: "重新扫描本机剪映缓存" }).click();
			await expect(
				lab.getByText(/显示 721 · 可用 721\/\d+ · 缓存 \d+/)
			).toBeVisible({ timeout: 120_000 });
			const catalog = await page.evaluate(() =>
				window.electronAPI?.jianyingFilterLab?.list()
			);
			expect(catalog?.availableCount).toBe(721);
			const expanded = expandedFilters.map(({ resourceId, title }) => {
				const entry = catalog?.filters.find(
					({ resourceId: candidate }) => candidate === resourceId
				);
				expect(entry).toMatchObject({
					title,
					implementation: "dual-lut",
					available: true,
				});
				if (!entry) throw new Error(`Missing expanded filter ${title}`);
				return entry;
			});
			const nativeEvidence = await expanded.reduce<
				Promise<
					Array<{
						resourceId: string;
						title: string;
						luts: Array<{ role: string; size: number; values: number }>;
						render: Awaited<ReturnType<typeof renderCurrentFrame>>;
					}>
				>
			>(async (pending, entry) => {
				const evidence = await pending;
				const luts = await loadFilterLuts({
					page,
					lutIds: entry.luts.map(({ lutId }) => lutId),
				});
				expect(luts).toEqual([
					{ role: "background", size: 64, values: 786_432 },
					{ role: "skin", size: 64, values: 786_432 },
				]);
				const render = await renderCurrentFrame({
					page,
					resourceId: entry.resourceId,
				});
				expect(render).toMatchObject({
					provider: "jianying-local-effect-v1",
					resourceId: entry.resourceId,
					width: 320,
				});
				expect(render.maskMaximum).toBeGreaterThan(0);
				expect(render.changedChannels).toBeGreaterThan(1000);
				return [
					...evidence,
					{ resourceId: entry.resourceId, title: entry.title, luts, render },
				];
			}, Promise.resolve([]));

			await lab
				.getByRole("searchbox", { name: "搜索剪映滤镜目录" })
				.fill(primaryFilter.title);
			const card = lab.getByTestId(
				`jianying-filter-${primaryFilter.resourceId}`
			);
			await expect(card).toBeVisible();
			await expect(card.getByText("双 LUT", { exact: true })).toBeVisible();
			await card
				.getByRole("button", { name: `应用 ${primaryFilter.title}` })
				.click();
			await expect
				.poll(() => adjustmentLutState({ page }), { timeout: 30_000 })
				.toMatchObject({
					name: primaryFilter.title,
					size: 64,
					values: 786_432,
					skinSize: 64,
					skinValues: 786_432,
					maskKind: "skin-segmentation-v1",
					resourceId: primaryFilter.resourceId,
				});
			await expect
				.poll(() => previewPixelCount({ page }), { timeout: 30_000 })
				.toBeGreaterThan(100);
			const bodyText = await page.locator("body").innerText();
			expect(bodyText).not.toContain("VideoFusion-macOS.app");
			expect(bodyText).not.toContain("Movies/JianyingPro");
			await page.screenshot({
				path: join(evidenceDirectory, "01-private-runtime-filter-lab.png"),
				animations: "disabled",
			});
			await page.getByTestId("preview-capture-surface").screenshot({
				path: join(evidenceDirectory, "02-new-dual-lut-preview.png"),
				animations: "disabled",
			});
			await writeFile(
				join(evidenceDirectory, "report.json"),
				`${JSON.stringify(
					{
						catalog: {
							availableCount: catalog?.availableCount,
							cachedCount: catalog?.cachedCount,
							count: catalog?.count,
						},
						filters: expanded,
						nativeEvidence,
						runtime,
					},
					null,
					2
				)}\n`,
				"utf8"
			);
		} finally {
			await electronApp.close();
			await rm(profileDirectory, { recursive: true, force: true });
		}
	});
});
