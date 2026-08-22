import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	expect,
	test,
	_electron as electron,
	type Locator,
	type Page,
} from "@playwright/test";
import {
	createTestProject,
	navigateToProjects,
	uploadTestMedia,
} from "./helpers/electron-helpers";

const earlierExpandedFilters = [
	{ resourceId: "7578191333169417523", title: "胶片微曝", loader: "lut" },
	{ resourceId: "7477802809971215653", title: "4K增质", loader: "lut" },
	{ resourceId: "7497887075627257114", title: "海边胶片", loader: "lut" },
	{ resourceId: "7477802799862992138", title: "4K画质", loader: "lut" },
	{ resourceId: "7281163501047991608", title: "暗曛", loader: "renderer" },
	{ resourceId: "7530690874699713842", title: "柏林", loader: "lut" },
	{ resourceId: "7501223866988039434", title: "落日电影", loader: "lut" },
	{ resourceId: "7581301466128780569", title: "安塞尔灰调", loader: "lut" },
	{ resourceId: "7190242827543022880", title: "安愉", loader: "lut" },
	{ resourceId: "7127656352410848548", title: "暗雅", loader: "lut" },
	{ resourceId: "7344374695053102371", title: "薄绿", loader: "lut" },
	{ resourceId: "7600301036787600667", title: "宝丽来SX70", loader: "lut" },
	{ resourceId: "7131656881805856013", title: "贝果", loader: "renderer" },
	{ resourceId: "7127576913375153415", title: "布朗", loader: "lut" },
	{ resourceId: "7630364601254808882", title: "大疆影片", loader: "lut" },
	{ resourceId: "7242212640498568503", title: "古罗马", loader: "lut" },
	{ resourceId: "7297134192100379938", title: "奶杏", loader: "lut" },
	{ resourceId: "7127621434230213924", title: "清晰", loader: "lut" },
	{ resourceId: "7527721135824211243", title: "海上冲浪", loader: "lut" },
	{ resourceId: "7659676233285913862", title: "晴天明媚", loader: "lut" },
	{ resourceId: "7643803947257367851", title: "富士卷", loader: "lut" },
	{ resourceId: "7596354290730552622", title: "古早高曝", loader: "lut" },
	{ resourceId: "7594878732377099556", title: "古早回忆录", loader: "lut" },
	{ resourceId: "7505662247407013135", title: "日落飞车", loader: "lut" },
	{ resourceId: "7501988309900528935", title: "科幻星球", loader: "lut" },
	{ resourceId: "7478641636092775743", title: "4K画质电影", loader: "lut" },
	{ resourceId: "7436068361622129929", title: "清晰增强", loader: "lut" },
	{ resourceId: "7631600978600480036", title: "富士影片", loader: "lut" },
	{ resourceId: "7131904196428827944", title: "冰糖葫芦", loader: "lut" },
	{ resourceId: "7633458987354049802", title: "暖调烘焙", loader: "lut" },
	{ resourceId: "7623429382014586174", title: "松烟墨", loader: "lut" },
	{ resourceId: "7622554933115555097", title: "勃艮第红", loader: "lut" },
	{ resourceId: "7524262165273005321", title: "森林徒步", loader: "lut" },
	{ resourceId: "7473126624322391308", title: "清透萌宠", loader: "lut" },
	{ resourceId: "7411911267859860746", title: "探店博主III", loader: "lut" },
	{ resourceId: "7271278427309755688", title: "忆山", loader: "lut" },
	{ resourceId: "7300758676732677427", title: "砂红", loader: "lut" },
	{ resourceId: "7297131749346135331", title: "桃粉", loader: "lut" },
	{ resourceId: "7143760738765655310", title: "快照II", loader: "lut" },
] as const;

const recentExpandedFilters = [
	{ resourceId: "7643857586474781993", title: "落日熔金", loader: "lut" },
	{ resourceId: "7592592527794998580", title: "轻古早", loader: "lut" },
	{ resourceId: "7498004563954322726", title: "加州落日", loader: "lut" },
	{ resourceId: "7630798925166873866", title: "浓郁影质", loader: "lut" },
	{ resourceId: "7496524092779105551", title: "日落时刻", loader: "lut" },
	{ resourceId: "7592591080688864546", title: "韩式古早", loader: "lut" },
	{ resourceId: "7435865312907676978", title: "高清美食", loader: "lut" },
	{ resourceId: "7347670931646549282", title: "漠土", loader: "lut" },
	{ resourceId: "7576707005788867875", title: "古早感胶片", loader: "lut" },
	{ resourceId: "7494135245709610275", title: "夜拍闪曝", loader: "lut" },
	{ resourceId: "7397751642390564134", title: "牧野", loader: "lut" },
	{ resourceId: "7475289663381540150", title: "超清电影卷", loader: "lut" },
	{ resourceId: "7281166220794055997", title: "味蕾", loader: "renderer" },
	{ resourceId: "7476104906924100915", title: "高清春日", loader: "lut" },
	{ resourceId: "7620853540034055465", title: "青绿电影", loader: "lut" },
	{ resourceId: "7506099780947430668", title: "末世天使", loader: "lut" },
	{ resourceId: "7517685395102977334", title: "柯达金200", loader: "lut" },
	{ resourceId: "7452946862581058853", title: "高清电影卷", loader: "lut" },
	{ resourceId: "7428162298436537627", title: "圣诞愿景", loader: "lut" },
	{ resourceId: "7502647335218941220", title: "撕拉拍立得", loader: "lut" },
	{ resourceId: "7444960692853148955", title: "高清雪景", loader: "lut" },
	{ resourceId: "7127653798155209997", title: "质感暗调", loader: "lut" },
	{ resourceId: "7394022809317526834", title: "萌宠", loader: "lut" },
	{ resourceId: "7143537677655100709", title: "快照I", loader: "lut" },
	{ resourceId: "7627466828339596606", title: "春游野餐", loader: "lut" },
	{ resourceId: "7493920442613288219", title: "朦胧气质棕", loader: "lut" },
	{ resourceId: "7127621445806525704", title: "中性", loader: "lut" },
	{ resourceId: "7343831195924303123", title: "郁金香", loader: "lut" },
	{ resourceId: "7596692097164479807", title: "古罗马电影", loader: "lut" },
	{ resourceId: "7426749131344841995", title: "万圣", loader: "lut" },
	{ resourceId: "7393943544089627930", title: "iPhone6s", loader: "lut" },
	{ resourceId: "7127668404764380447", title: "褪色", loader: "lut" },
	{ resourceId: "7127653100269210916", title: "暖食", loader: "lut" },
	{ resourceId: "7502329862581996854", title: "科切拉", loader: "lut" },
	{ resourceId: "7443101069539953931", title: "清晰提升", loader: "lut" },
	{ resourceId: "7374251948058447158", title: "落日鎏金", loader: "lut" },
	{ resourceId: "7312645421271158070", title: "灰麻", loader: "lut" },
	{ resourceId: "7271284653816843554", title: "墨林", loader: "lut" },
	{ resourceId: "7270142995712773415", title: "安西娅", loader: "lut" },
	{ resourceId: "7246720031118101816", title: "富士蓝", loader: "lut" },
	{ resourceId: "7127663117508660517", title: "赫本", loader: "lut" },
	{ resourceId: "7127621137705618724", title: "轻食", loader: "lut" },
	{ resourceId: "7437098009827036455", title: "高清影视", loader: "lut" },
	{ resourceId: "7431914955747691810", title: "雪地胶片III", loader: "lut" },
	{ resourceId: "7368141858603666698", title: "落日粉", loader: "lut" },
	{ resourceId: "7300968790391606567", title: "素简", loader: "lut" },
	{ resourceId: "7271281225115897140", title: "原野", loader: "lut" },
	{ resourceId: "7233734975839898940", title: "曼波", loader: "lut" },
	{ resourceId: "7431914902177991970", title: "雪地胶片II", loader: "lut" },
	{ resourceId: "7362076973981584691", title: "小麦色", loader: "lut" },
	{ resourceId: "7273779209934245179", title: "棕咖", loader: "lut" },
	{ resourceId: "7262351934785408267", title: "暮川", loader: "lut" },
	{ resourceId: "7210645355136961852", title: "涩谷", loader: "lut" },
	{ resourceId: "7442390492307836186", title: "清晰质感", loader: "lut" },
	{ resourceId: "7586719222160543017", title: "围炉暖食", loader: "lut" },
	{ resourceId: "7431914829876694324", title: "雪地胶片", loader: "lut" },
	{ resourceId: "7336763348492553499", title: "底特律", loader: "lut" },
	{ resourceId: "7262350396566342975", title: "幽海", loader: "lut" },
	{ resourceId: "7252676190073392444", title: "棕榈", loader: "lut" },
	{ resourceId: "7177728466354326822", title: "茶墨", loader: "lut" },
	{ resourceId: "7145394908608662814", title: "灯会", loader: "lut" },
	{ resourceId: "7580047192463969560", title: "鲜萃食光", loader: "lut" },
	{ resourceId: "7538027894447131967", title: "背景增色", loader: "lut" },
	{ resourceId: "7242211155131862332", title: "暮光", loader: "lut" },
	{ resourceId: "7320434750018047251", title: "鲜明", loader: "lut" },
] as const;

const retainedExpandedFilters = [
	...earlierExpandedFilters,
	...recentExpandedFilters,
] as const;

const expectedCategories = [
	{ name: "🍉夏日", available: 117, total: 138 },
	{ name: "美食", available: 48, total: 56 },
	{ name: "风景", available: 128, total: 153 },
	{ name: "最新", available: 128, total: 145 },
	{ name: "人像", available: 207, total: 237 },
	{ name: "影视级", available: 83, total: 100 },
	{ name: "夜景", available: 45, total: 54 },
	{ name: "户外", available: 41, total: 53 },
	{ name: "相机模拟", available: 27, total: 50 },
	{ name: "高清", available: 32, total: 37 },
	{ name: "室内", available: 51, total: 58 },
	{ name: "复古胶片", available: 69, total: 102 },
	{ name: "风格化", available: 34, total: 50 },
	{ name: "黑白", available: 16, total: 19 },
	{ name: "基础", available: 13, total: 16 },
] as const;

const privateRuntimeRoot = join(
	homedir(),
	"Library",
	"Application Support",
	"QCut",
	"PrivateRuntimes",
	"JianyingFilter",
	"current"
);
const portraitSourcePath = join(
	process.cwd(),
	"output",
	"playwright",
	"portrait-filter-transition-audit",
	"sources",
	"colorful-influencer-10s.mp4"
);
const researchRoot = join(
	homedir(),
	"Library",
	"Application Support",
	"QCut",
	"Research",
	"JianyingFilter"
);
const retainedSelectionPaths = [
	"category-expansion-batch-4-2026-08-22",
	"category-expansion-batch-5-2026-08-22",
	"category-expansion-batch-6-2026-08-22",
].map((batch) => join(researchRoot, batch, "selection.json"));
const latestBatch = "category-expansion-batch-7-2026-08-22";
const latestSelectionPath = join(researchRoot, latestBatch, "selection.json");
const evidenceDirectory = join(researchRoot, latestBatch, "ui");
const enabled =
	existsSync(join(privateRuntimeRoot, "manifest.json")) &&
	existsSync(join(privateRuntimeRoot, "Frameworks", "libcccreator.dylib")) &&
	existsSync(portraitSourcePath) &&
	retainedSelectionPaths.every((selectionPath) => existsSync(selectionPath)) &&
	existsSync(latestSelectionPath);

async function addFirstVideo({ page }: { page: Page }) {
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

async function screenshotCategory({
	lab,
	name,
	page,
	path,
	visibleTitle,
}: {
	lab: Locator;
	name: string;
	page: Page;
	path: string;
	visibleTitle: string;
}) {
	const category = expectedCategories.find((entry) => entry.name === name);
	if (!category) throw new Error(`Unknown category ${name}`);
	await lab
		.getByRole("tab", {
			name: `${category.name} ${category.available}/${category.total}`,
		})
		.click();
	const search = lab.getByRole("searchbox", {
		name: "搜索剪映滤镜目录",
	});
	await search.fill(visibleTitle);
	await expect(lab.getByText(visibleTitle, { exact: true })).toBeVisible();
	await page.screenshot({ path, animations: "disabled" });
	await search.clear();
}

test.describe("Jianying Filter Lab category expansion", () => {
	test.skip(!enabled, "Requires the QCut private runtime snapshot and video");

	// biome-ignore lint/correctness/noEmptyPattern: the test launches its own isolated Electron process.
	test("loads the 85-filter expansion and retains earlier batches without Jianying", async ({}) => {
		test.setTimeout(420_000);
		type SelectionReport = {
			selected: Array<{
				resourceId: string;
				title: string;
				renderer?: unknown;
			}>;
		};
		const selectionReports = (await Promise.all(
			[...retainedSelectionPaths, latestSelectionPath].map(
				async (selectionPath) =>
					JSON.parse(await readFile(selectionPath, "utf8"))
			)
		)) as SelectionReport[];
		const latestSelection = selectionReports.at(-1);
		if (!latestSelection) throw new Error("Latest filter selection is missing");
		const retainedFilters = [
			...retainedExpandedFilters,
			...selectionReports.slice(0, -1).flatMap(({ selected }) => selected),
		];
		const expandedFilters = latestSelection.selected.map(
			({ resourceId, title, renderer }) => ({
				resourceId,
				title,
				loader: renderer ? ("renderer" as const) : ("lut" as const),
			})
		);
		expect(retainedFilters).toHaveLength(537);
		expect(expandedFilters).toHaveLength(85);
		const profileDirectory = join(
			tmpdir(),
			`qcut-filter-categories-${process.pid}-${Date.now()}`
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
				QCUT_JIANYING_FILTER_CACHE_ROOT: join(privateRuntimeRoot, "Cache"),
				QCUT_JIANYING_FILTER_PACKAGE_ROOT: join(
					tmpdir(),
					"qcut-filter-category-no-managed",
					"artistEffect"
				),
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
			await createTestProject(page, "Filter Category Expansion E2E");
			await uploadTestMedia(page, portraitSourcePath);
			await addFirstVideo({ page });
			await page.getByTestId("filters-panel-tab").click();
			await page.getByRole("button", { name: "滤镜实验室" }).click();
			const lab = page.getByTestId("jianying-filter-lab");
			await expect(lab).toBeVisible();
			await expect(
				lab.getByTestId("jianying-filter-runtime-status")
			).toContainText("QCut 离线运行已就绪", { timeout: 120_000 });
			await lab.getByRole("button", { name: "重新扫描本机剪映缓存" }).click();
			await expect(
				lab.getByText(/显示 712 · 可用 712\/\d+ · 缓存 \d+/)
			).toBeVisible({ timeout: 120_000 });

			await Promise.all(
				expectedCategories.map(({ name, available, total }) =>
					expect(
						lab.getByRole("tab", { name: `${name} ${available}/${total}` })
					).toBeVisible()
				)
			);
			const evidence = await page.evaluate(
				async ({ definitions, retainedDefinitions }) => {
					const api = window.electronAPI?.jianyingFilterLab;
					if (!api) throw new Error("Filter Lab API unavailable");
					const [catalog, runtime] = await Promise.all([
						api.list(),
						api.inspectLocalRuntime({ refresh: true }),
					]);
					if (!runtime.offlineReady) {
						throw new Error("QCut private filter runtime is not offline-ready");
					}
					type LoadedFilter = {
						resourceId: string;
						title: string;
						loader: string;
						implementation: string;
						loaded: string;
					};
					const retained = retainedDefinitions.map(({ resourceId, title }) => {
						const filter = catalog.filters.find(
							({ resourceId: candidate }) => candidate === resourceId
						);
						if (!filter?.available) {
							throw new Error(`Regressed expanded filter ${title}`);
						}
						return { resourceId, title, implementation: filter.implementation };
					});
					const loadDefinition = async ({
						resourceId,
						title,
						loader,
					}: (typeof definitions)[number]): Promise<LoadedFilter> => {
						const filter = catalog.filters.find(
							({ resourceId: candidate }) => candidate === resourceId
						);
						if (!filter?.available) {
							throw new Error(`Unavailable expanded filter ${title}`);
						}
						if (loader === "renderer") {
							const renderer = await api.loadRenderer({ resourceId });
							return {
								resourceId,
								title,
								loader,
								implementation: filter.implementation,
								loaded: `${renderer.nativeEffect ? "native" : "structural"}-${renderer.passes.length}pass`,
							};
						}
						const luts = await Promise.all(
							filter.luts.map(({ lutId }) => api.load({ lutId }))
						);
						if (luts.length === 0) {
							throw new Error(`Missing LUT for ${title}`);
						}
						return {
							resourceId,
							title,
							loader,
							implementation: filter.implementation,
							loaded: luts.map(({ cube }) => `lut-${cube.size}`).join("+"),
						};
					};
					const loadInChunks = async ({
						offset,
					}: {
						offset: number;
					}): Promise<LoadedFilter[]> => {
						const loadedChunk = await Promise.all(
							definitions.slice(offset, offset + 6).map(loadDefinition)
						);
						const nextOffset = offset + 6;
						if (nextOffset >= definitions.length) return loadedChunk;
						return [
							...loadedChunk,
							...(await loadInChunks({ offset: nextOffset })),
						];
					};
					const loaded = await loadInChunks({ offset: 0 });
					return {
						catalog: {
							availableCount: catalog.availableCount,
							cachedCount: catalog.cachedCount,
							count: catalog.count,
							categories: catalog.categories,
						},
						loaded,
						retained,
						runtime,
					};
				},
				{
					definitions: expandedFilters,
					retainedDefinitions: retainedFilters,
				}
			);
			expect(evidence.catalog).toMatchObject({
				availableCount: 712,
				cachedCount: 725,
				count: 887,
			});
			expect(evidence.retained).toHaveLength(retainedFilters.length);
			expect(evidence.loaded).toHaveLength(expandedFilters.length);
			expect(evidence.loaded.every(({ loaded }) => loaded.length > 0)).toBe(
				true
			);

			await page.screenshot({
				path: join(evidenceDirectory, "01-all-category-counts.png"),
				animations: "disabled",
			});
			await screenshotCategory({
				lab,
				name: "🍉夏日",
				page,
				path: join(evidenceDirectory, "02-summer-latest-expansion.png"),
				visibleTitle: "热烈",
			});
			await screenshotCategory({
				lab,
				name: "人像",
				page,
				path: join(evidenceDirectory, "03-portrait-latest-expansion.png"),
				visibleTitle: "健美",
			});
			await screenshotCategory({
				lab,
				name: "风景",
				page,
				path: join(evidenceDirectory, "04-landscape-latest-expansion.png"),
				visibleTitle: "山川之旅",
			});
			await screenshotCategory({
				lab,
				name: "室内",
				page,
				path: join(evidenceDirectory, "05-indoor-latest-expansion.png"),
				visibleTitle: "侘寂灰",
			});
			await writeFile(
				join(evidenceDirectory, "report.json"),
				`${JSON.stringify(evidence, null, 2)}\n`,
				"utf8"
			);
		} finally {
			await electronApp.close();
			await rm(profileDirectory, { recursive: true, force: true });
		}
	});
});
