import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import {
	createTestProject,
	expect,
	getMainWindow,
	importTestVideo,
	navigateToProjects,
	startElectronApp,
	stubExportSaveDialog,
	test,
} from "./helpers/electron-helpers";
import {
	openSoundEffectsLab,
	verifySoundEffectsOfflinePlayback,
} from "./helpers/sound-effects-lab-proof";

const evidenceDirectory = path.join(
	process.cwd(),
	"docs/task/sound-effects-lab/evidence/batch-09"
);
const outputDirectory = path.join(
	homedir(),
	"Documents/QCut/Exports/qcut-sfx-lab-batch-09-2026-08-27"
);
const exportPath = path.join(
	outputDirectory,
	"sound-effects-lab-e2e-export.mp4"
);
const reportPath = path.join(
	outputDirectory,
	"sound-effects-lab-e2e-report.json"
);
const userDataDirectory = path.join(
	outputDirectory,
	"sound-effects-lab-e2e-user-data"
);
const projectName = "Sound Effects Lab private E2E";
const folderName = "E2E 可复用";
const cc0CardTestId = "audio-library-item-sound-effect--900001108";
const productionLicenseServerUrl =
	"https://qcut-license-server.zdhpeter.workers.dev";

interface ProductionManifestStats {
	enrichedItems: number;
	enrichedVipItems: number;
	legacyItems: number;
}

async function loadProductionManifestStats({
	page,
}: {
	page: Page;
}): Promise<ProductionManifestStats> {
	return page.evaluate(
		async ({ licenseServerUrl }) => {
			const token = await window.electronAPI.license.getAuthToken();
			if (!token) throw new Error("QCut auth token is unavailable");
			const loadManifest = async ({ path }: { path: string }) => {
				const response = await fetch(`${licenseServerUrl}${path}`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				if (!response.ok) {
					throw new Error(`Manifest request failed (${response.status})`);
				}
				return (await response.json()) as {
					items: Array<{ source?: { access?: { isVip?: boolean } } }>;
				};
			};
			const [enriched, legacy] = await Promise.all([
				loadManifest({
					path: "/api/sound-effects-lab/private-manifest/enriched?includeAliases=1",
				}),
				loadManifest({ path: "/api/sound-effects-lab/private-manifest" }),
			]);
			return {
				enrichedItems: enriched.items.length,
				enrichedVipItems: enriched.items.filter(
					(item) => item.source?.access?.isVip === true
				).length,
				legacyItems: legacy.items.length,
			};
		},
		{ licenseServerUrl: productionLicenseServerUrl }
	);
}

async function stopElectronApp({
	electronApp,
}: {
	electronApp: ElectronApplication;
}): Promise<void> {
	const processHandle = electronApp.process();
	if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
		await electronApp.close().catch(() => undefined);
		return;
	}
	const exited = new Promise<void>((resolve) => {
		processHandle.once("exit", () => resolve());
	});
	const forceQuit = setTimeout(() => {
		if (processHandle.exitCode === null && processHandle.signalCode === null) {
			processHandle.kill("SIGKILL");
		}
	}, 10_000);
	try {
		await electronApp.close().catch(() => undefined);
		await exited;
	} finally {
		clearTimeout(forceQuit);
	}
}

test.skip(
	process.env.QCUT_RUN_PRIVATE_SFX_E2E !== "1",
	"Requires the allowlisted private Sound Effects Lab account"
);

test.describe("Sound Effects Lab private package", () => {
	test.setTimeout(900_000);
	test.use({ captureScreenshotVideo: false });

	for (const scenario of ["offline", "persistence"] as const) {
		test(
			scenario === "offline"
				? "downloads the full package and plays new originals offline"
				: "preserves reusable sounds across restart and export",
			async () => {
				const scenarioReportPath =
					scenario === "offline"
						? path.join(
								outputDirectory,
								"sound-effects-lab-offline-e2e-report.json"
							)
						: reportPath;
				await mkdir(evidenceDirectory, { recursive: true });
				await mkdir(outputDirectory, { recursive: true });
				if (scenario === "persistence") await rm(exportPath, { force: true });
				await rm(scenarioReportPath, { force: true });
				await rm(userDataDirectory, { force: true, recursive: true });

				let electronApp = await startElectronApp({ userDataDirectory });
				let page: Page;
				let exportBytes = 0;
				const startedAt = Date.now();

				try {
					page = await getMainWindow(electronApp);
					await page.setViewportSize({ width: 1500, height: 900 });
					await page.evaluate(() => {
						localStorage.setItem("hasSeenOnboarding", "true");
					});
					const productionManifestStats = await loadProductionManifestStats({
						page,
					});
					expect(productionManifestStats).toEqual({
						enrichedItems: 1736,
						enrichedVipItems: 773,
						legacyItems: 1731,
					});
					await navigateToProjects(page);
					await createTestProject(page, projectName);
					await expect(page.getByTestId("user-library-sync")).toHaveAttribute(
						"title",
						/个人资源库已同步|Library synced/,
						{ timeout: 30_000 }
					);

					await importTestVideo(page);
					const mediaItem = page.getByTestId("media-item").first();
					await expect(mediaItem).toBeVisible();
					await mediaItem.hover();
					await mediaItem.locator("button").click();
					await expect(page.getByTestId("timeline-element")).toHaveCount(1);

					await page.getByTestId("audio-panel-tab").click();
					const audioLibrary = page.getByTestId("audio-library");
					await expect(audioLibrary).toBeVisible();
					await openSoundEffectsLab({ page });
					const lab = page.getByTestId("sound-effects-lab");
					await expect(lab).toBeVisible();
					await expect(
						lab.getByText(/1736 个音效 · 20 个分类|1736 sounds · 20 categories/)
					).toBeVisible({ timeout: 30_000 });
					await expect(
						lab.getByText(/314 个可复用|314 reusable/)
					).toBeVisible();
					await expect(
						lab.getByText(/1422 个受限|1422 restricted/)
					).toBeVisible();
					await expect(lab.getByText(/773 个 VIP|773 VIP/)).toBeVisible();
					const heading = lab.getByRole("heading", {
						name: /音效实验室|Sound Effects Lab/,
					});
					expect(
						await heading.evaluate(
							(element) => element.scrollWidth <= element.clientWidth
						)
					).toBe(true);
					await page.screenshot({
						path: path.join(evidenceDirectory, "01-live-catalog-1736.png"),
						animations: "disabled",
					});

					if (scenario === "offline") {
						const offlineResults = await verifySoundEffectsOfflinePlayback({
							page,
							lab,
							evidenceDirectory,
						});
						await writeFile(
							scenarioReportPath,
							`${JSON.stringify(
								{
									catalogItems: 1736,
									categories: 20,
									elapsedSeconds: (Date.now() - startedAt) / 1000,
									productionManifestStats,
									...offlineResults,
								},
								null,
								2
							)}\n`,
							"utf8"
						);
						return;
					}

					const existingFolder = audioLibrary.locator(
						`button[title="${folderName}"]`
					);
					if ((await existingFolder.count()) === 0) {
						await audioLibrary
							.getByRole("button", { name: /新建收藏夹|Create folder/ })
							.click();
						const folderDialog = page.getByRole("dialog");
						await folderDialog
							.getByLabel(/收藏夹名称|Folder name/)
							.fill(folderName);
						await folderDialog
							.getByRole("button", { name: /保存|Save/ })
							.click();
						await expect(folderDialog).toBeHidden();
					}
					await openSoundEffectsLab({ page });
					await expect(lab).toBeVisible();

					await lab
						.getByRole("textbox", {
							name: /搜索音效实验室|Search Sound Effects Lab/,
						})
						.fill("Crowd laugh");
					const cc0Card = lab.getByTestId(cc0CardTestId);
					await expect(cc0Card).toBeVisible();
					await expect(cc0Card).toHaveAttribute("draggable", "true");
					const favoriteButton = cc0Card.getByRole("button", {
						name: /收藏Crowd laugh|Favorite Crowd laugh/,
					});
					const removeFavoriteButton = cc0Card.getByRole("button", {
						name: /取消收藏Crowd laugh|Remove Crowd laugh from favorites/,
					});
					if (await removeFavoriteButton.isVisible()) {
						await removeFavoriteButton.click();
						await expect(favoriteButton).toBeVisible();
					}
					await favoriteButton.click();
					await expect(removeFavoriteButton).toBeVisible();

					await cc0Card
						.getByRole("button", {
							name: /Crowd laugh的更多操作|More actions for Crowd laugh/,
						})
						.click();
					const addToFolder = page.getByRole("menuitem", {
						name: /加入收藏夹|Add to folder/,
					});
					await addToFolder.hover();
					const folderCheckbox = page.getByRole("menuitemcheckbox", {
						name: folderName,
					});
					if ((await folderCheckbox.getAttribute("data-state")) !== "checked") {
						await folderCheckbox.click();
					}
					await page.keyboard.press("Escape");
					await page.screenshot({
						path: path.join(evidenceDirectory, "23-cc0-personal-actions.png"),
						animations: "disabled",
					});

					await cc0Card
						.getByRole("button", {
							name: /将Crowd laugh添加到时间线|Add Crowd laugh to timeline/,
						})
						.click();
					const audioTimelineItems = page.locator(
						'[data-testid="timeline-track"][data-track-type="audio"] [data-testid="timeline-element"]'
					);
					await expect(audioTimelineItems).toHaveCount(1, { timeout: 30_000 });
					await page.screenshot({
						path: path.join(evidenceDirectory, "24-cc0-timeline.png"),
						animations: "disabled",
					});

					await page.waitForTimeout(1_500);
					await page.evaluate(() => {
						window.location.hash = "#/projects";
					});
					await expect(page.getByTestId("project-list-item")).toHaveCount(1);
					await stopElectronApp({ electronApp });

					electronApp = await startElectronApp({ userDataDirectory });
					page = await getMainWindow(electronApp);
					await page.setViewportSize({ width: 1500, height: 900 });
					await navigateToProjects(page);
					const project = page.getByTestId("project-list-item").first();
					await expect(project).toBeVisible();
					await project.click();
					await expect(
						page.locator(
							'[data-testid="timeline-track"][data-track-type="audio"] [data-testid="timeline-element"]'
						)
					).toHaveCount(1, { timeout: 20_000 });

					await page.getByTestId("audio-panel-tab").click();
					const reopenedLibrary = page.getByTestId("audio-library");
					await reopenedLibrary
						.getByRole("button", { name: /^(收藏|Favorites)$/ })
						.click();
					const restoredCard = reopenedLibrary.getByTestId(cc0CardTestId);
					await expect(restoredCard).toBeVisible();
					await expect(
						restoredCard.getByRole("button", {
							name: /取消收藏Crowd laugh|Remove Crowd laugh from favorites/,
						})
					).toBeVisible();
					await page.screenshot({
						path: path.join(evidenceDirectory, "25-restart-persistence.png"),
						animations: "disabled",
					});

					await stubExportSaveDialog({ electronApp, outputPath: exportPath });
					await page.getByTestId("export-button").click();
					await expect(page.getByTestId("export-dialog")).toBeVisible();
					const includeAudio = page.getByTestId(
						"export-include-audio-checkbox"
					);
					if (!(await includeAudio.isChecked())) await includeAudio.check();
					await page.getByTestId("export-start-button").click();
					await expect
						.poll(
							async () => {
								try {
									exportBytes = (await stat(exportPath)).size;
									return exportBytes;
								} catch {
									return 0;
								}
							},
							{ timeout: 120_000 }
						)
						.toBeGreaterThan(1_000);
					await page.screenshot({
						path: path.join(evidenceDirectory, "26-export-complete.png"),
						animations: "disabled",
					});

					await writeFile(
						scenarioReportPath,
						`${JSON.stringify(
							{
								catalogItems: 1736,
								elapsedSeconds: (Date.now() - startedAt) / 1000,
								categories: 20,
								reusableItems: 314,
								restrictedItems: 1422,
								vipItems: 773,
								productionManifestStats,
								selectedSound: "Crowd laugh",
								favoriteRestored: true,
								folderAssignmentCompleted: true,
								timelineAudioRestored: true,
								exportBytes,
								exportPath,
							},
							null,
							2
						)}\n`,
						"utf8"
					);
				} finally {
					await stopElectronApp({ electronApp });
					await rm(userDataDirectory, { force: true, recursive: true });
				}
			}
		);
	}
});
