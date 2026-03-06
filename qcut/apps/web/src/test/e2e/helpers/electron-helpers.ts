/**
 * Electron E2E Testing Helpers
 *
 * Core fixtures and app-level helpers for Playwright E2E tests.
 * Panel/media helpers: e2e-panel-helpers.ts
 * Export/recording helpers: e2e-export-helpers.ts
 */

import { test as base, Page } from "@playwright/test";
import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { ElectronApplication, _electron as electron } from "playwright";
import { resolve as pathResolve } from "path";
import ffmpegStaticPath from "ffmpeg-static";

const SCREENSHOT_VIDEO_FPS = 2;
const SCREENSHOT_CAPTURE_INTERVAL_MS = 500;

function waitForDuration({
	durationMs,
}: {
	durationMs: number;
}): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, durationMs);
	});
}

async function buildVideoFromScreenshotFrames({
	frameDirectoryPath,
	outputVideoPath,
	fps,
}: {
	frameDirectoryPath: string;
	outputVideoPath: string;
	fps: number;
}): Promise<boolean> {
	try {
		if (!ffmpegStaticPath) {
			console.warn(
				"⚠️  ffmpeg-static path unavailable; skipping screenshot video encoding"
			);
			return false;
		}

		const inputPatternPath = pathResolve(frameDirectoryPath, "frame-%06d.png");
		const ffmpegArgs = [
			"-y",
			"-hide_banner",
			"-loglevel",
			"error",
			"-framerate",
			String(fps),
			"-i",
			inputPatternPath,
			"-vf",
			"pad=ceil(iw/2)*2:ceil(ih/2)*2",
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-movflags",
			"+faststart",
			outputVideoPath,
		];

		const stderrLines: Array<string> = [];

		await new Promise<void>((resolve, reject) => {
			const ffmpegProcess = spawn(ffmpegStaticPath, ffmpegArgs, {
				stdio: ["ignore", "ignore", "pipe"],
			});

			ffmpegProcess.stderr.on("data", (chunk: Buffer) => {
				stderrLines.push(chunk.toString());
			});

			ffmpegProcess.on("error", (error) => {
				reject(error);
			});

			ffmpegProcess.on("close", (exitCode) => {
				if (exitCode === 0) {
					resolve();
					return;
				}

				reject(
					new Error(
						`ffmpeg exited with code ${exitCode ?? -1}: ${stderrLines.join("").trim()}`
					)
				);
			});
		});

		return true;
	} catch (error) {
		console.warn(
			`⚠️  Failed to encode screenshot frames into video: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
		return false;
	}
}

/**
 * Electron-specific test fixtures that extend Playwright's base fixtures.
 */
export interface ElectronFixtures {
	/** The Electron application instance */
	electronApp: ElectronApplication;
	/** The main window page instance */
	page: Page;
}

/**
 * Cleans up all persistent storage (IndexedDB, localStorage, sessionStorage)
 * to ensure test isolation and prevent state pollution between tests.
 */
export async function cleanupDatabase(page: Page) {
	try {
		if (page.isClosed()) {
			console.log("🧹 Page already closed, skipping cleanup");
			return;
		}

		console.log("🧹 Starting database cleanup...");

		const cleanupStats = await page.evaluate(async () => {
			const stats = {
				databasesFound: 0,
				databasesDeleted: 0,
				localStorageItems: 0,
				sessionStorageItems: 0,
				cachesCleared: 0,
				databaseNames: [] as string[],
			};

			const databases = await indexedDB.databases();
			stats.databasesFound = databases.length;
			stats.databaseNames = databases
				.map((db) => db.name || "unnamed")
				.filter((name) => name !== "unnamed");

			console.log(
				`📊 Found ${databases.length} IndexedDB database(s) to delete`
			);

			await Promise.all(
				databases.map((db) => {
					if (db.name) {
						console.log(`  🗑️  Deleting database: ${db.name}`);
						return new Promise<void>((resolve, reject) => {
							const request = indexedDB.deleteDatabase(db.name!);
							request.onsuccess = () => {
								stats.databasesDeleted++;
								console.log(`  ✅ Deleted database: ${db.name}`);
								resolve();
							};
							request.onerror = () => {
								console.error(`  ❌ Failed to delete database: ${db.name}`);
								reject(request.error);
							};
							request.onblocked = () => {
								console.warn(
									`  ⚠️  Database ${db.name} deletion blocked, continuing anyway`
								);
								stats.databasesDeleted++;
								resolve();
							};
						});
					}
					return Promise.resolve();
				})
			);

			stats.localStorageItems = localStorage.length;
			if (stats.localStorageItems > 0) {
				console.log(
					`📦 Clearing ${stats.localStorageItems} localStorage item(s)`
				);
				localStorage.clear();
			}

			stats.sessionStorageItems = sessionStorage.length;
			if (stats.sessionStorageItems > 0) {
				console.log(
					`📦 Clearing ${stats.sessionStorageItems} sessionStorage item(s)`
				);
				sessionStorage.clear();
			}

			if ("caches" in window) {
				const cacheNames = await caches.keys();
				stats.cachesCleared = cacheNames.length;
				if (stats.cachesCleared > 0) {
					console.log(
						`🗄️  Clearing ${stats.cachesCleared} service worker cache(s)`
					);
					await Promise.all(
						cacheNames.map((name) => {
							console.log(`  🗑️  Deleting cache: ${name}`);
							return caches.delete(name);
						})
					);
				}
			}

			return stats;
		});

		try {
			await page.evaluate(async () => {
				// @ts-expect-error - electronAPI is exposed via preload
				if (window.electronAPI?.storage?.clear) {
					console.log(
						"📂 Clearing Electron file system storage (project .json files)..."
					);
					// @ts-expect-error
					await window.electronAPI.storage.clear();
					console.log("✅ Electron file system storage cleared");
				}
			});
		} catch (error) {
			console.warn("⚠️  Failed to clear Electron file system storage:", error);
		}

		console.log("✅ Database cleanup completed:");
		console.log(
			`   📊 Databases deleted: ${cleanupStats.databasesDeleted}/${cleanupStats.databasesFound}`
		);
		console.log(
			`   📦 localStorage items cleared: ${cleanupStats.localStorageItems}`
		);
		console.log(
			`   📦 sessionStorage items cleared: ${cleanupStats.sessionStorageItems}`
		);
		console.log(`   🗄️  Caches cleared: ${cleanupStats.cachesCleared}`);

		if (
			cleanupStats.databasesDeleted > 0 ||
			cleanupStats.localStorageItems > 0 ||
			cleanupStats.sessionStorageItems > 0
		) {
			console.log(
				"🎉 Successfully cleaned up test data - tests will start with clean slate!"
			);

			if (cleanupStats.databaseNames && cleanupStats.databaseNames.length > 0) {
				console.log("\n📝 Database samples (first 10):");
				cleanupStats.databaseNames.slice(0, 10).forEach((name, i) => {
					console.log(`   ${i + 1}. ${name}`);
				});
				if (cleanupStats.databaseNames.length > 10) {
					console.log(
						`   ... and ${cleanupStats.databaseNames.length - 10} more`
					);
				}
			}
		} else {
			console.log("✨ Database already clean - no data to remove");
		}
	} catch (error) {
		console.warn("⚠️  Database cleanup encountered an error:", error);
	}
}

export const test = base.extend<ElectronFixtures>({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require empty destructuring
	electronApp: async ({}, use) => {
		const electronApp = await startElectronApp();
		await use(electronApp);
		await electronApp.close();
	},

	page: async ({ electronApp }, use, testInfo) => {
		const page = await electronApp.firstWindow();
		let frameCaptureLoopPromise: Promise<void> | null = null;
		let frameCaptureActive = false;
		let frameDirectoryPath: string | null = null;
		let frameCount = 0;

		page.on("console", (msg) => {
			const type = msg.type();
			const text = msg.text();
			const prefix = `[RENDERER ${type.toUpperCase()}]`;

			if (type === "error") {
				console.error(`${prefix} ${text}`);
			} else if (type === "warning") {
				console.warn(`${prefix} ${text}`);
			} else {
				console.log(`${prefix} ${text}`);
			}
		});

		page.on("pageerror", (error) => {
			console.error(`[RENDERER PAGE ERROR] ${error.message}`);
			console.error(error.stack);
		});

		page.on("requestfailed", (request) => {
			console.error(
				`[RENDERER REQUEST FAILED] ${request.url()} - ${request.failure()?.errorText}`
			);
		});

		await page.waitForLoadState("domcontentloaded");

		try {
			await page.waitForFunction(
				() => {
					const root = document.getElementById("root");
					return root && root.children.length > 0;
				},
				{ timeout: 30_000 }
			);
			console.log("✅ React app mounted successfully");
		} catch (error) {
			console.error("❌ React app failed to mount within 30s");
			const html = await page.content();
			console.log("Page HTML length:", html.length);
			const bodyContent = await page.evaluate(
				() => document.body?.innerHTML?.substring(0, 500) || "No body"
			);
			console.log("Body content preview:", bodyContent);
		}

		await cleanupDatabase(page);

		await page.evaluate(() => {
			localStorage.setItem("hasSeenOnboarding", "true");
		});

		await navigateToProjects(page);

		try {
			frameDirectoryPath = testInfo.outputPath("screen-recording-frames");
			await mkdir(frameDirectoryPath, { recursive: true });
			frameCaptureActive = true;

			frameCaptureLoopPromise = (async () => {
				while (frameCaptureActive) {
					try {
						if (page.isClosed()) {
							break;
						}

						const frameFileName = `frame-${String(frameCount).padStart(6, "0")}.png`;
						const framePath = pathResolve(frameDirectoryPath!, frameFileName);
						await page.screenshot({
							path: framePath,
							animations: "disabled",
						});
						frameCount += 1;
					} catch (error) {
						if (!page.isClosed()) {
							console.warn(
								`⚠️  Screenshot frame capture failed: ${
									error instanceof Error ? error.message : String(error)
								}`
							);
						}
					}

					await waitForDuration({
						durationMs: SCREENSHOT_CAPTURE_INTERVAL_MS,
					});
				}
			})();
		} catch (error) {
			console.warn(
				`⚠️  Failed to initialize per-test screenshot capture: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}

		try {
			await use(page);
		} finally {
			frameCaptureActive = false;

			if (frameCaptureLoopPromise) {
				try {
					await frameCaptureLoopPromise;
				} catch (error) {
					console.warn(
						`⚠️  Failed while waiting for screenshot capture loop: ${
							error instanceof Error ? error.message : String(error)
						}`
					);
				}
			}

			if (frameDirectoryPath && frameCount > 0) {
				await buildVideoFromScreenshotFrames({
					frameDirectoryPath,
					outputVideoPath: testInfo.outputPath("screen-recording.mp4"),
					fps: SCREENSHOT_VIDEO_FPS,
				});
			}

			if (frameDirectoryPath) {
				try {
					await rm(frameDirectoryPath, { recursive: true, force: true });
				} catch (error) {
					console.warn(
						`⚠️  Failed to remove temporary screenshot frames: ${
							error instanceof Error ? error.message : String(error)
						}`
					);
				}
			}

			await cleanupDatabase(page);
		}
	},
});

export { expect } from "@playwright/test";

/**
 * Navigates from home page to projects page for E2E testing.
 */
export async function navigateToProjects(page: Page) {
	try {
		await page.waitForLoadState("networkidle", { timeout: 10_000 });

		const anyProjectButton = page.locator(
			'[data-testid="new-project-button"], [data-testid="new-project-button-mobile"], [data-testid="new-project-button-empty-state"]'
		);
		if (await anyProjectButton.first().isVisible({ timeout: 2000 })) {
			return;
		}

		const tryBetaButton = page.locator('a[href="/projects"] button', {
			hasText: "Try early beta",
		});
		if (await tryBetaButton.isVisible({ timeout: 5000 })) {
			await tryBetaButton.click();
		} else {
			await page.evaluate(() => {
				const router = (window as any).router;
				if (router && router.navigate) {
					router.navigate({ to: "/projects" });
				} else {
					window.location.hash = "#/projects";
				}
			});
		}

		await page.waitForSelector(
			'[data-testid="new-project-button"], [data-testid="new-project-button-mobile"], [data-testid="new-project-button-empty-state"], [data-testid="project-list"]',
			{ timeout: 10_000, state: "attached" }
		);
	} catch (error) {
		console.warn(
			"Navigation to projects page failed, continuing anyway:",
			error
		);
	}
}

/**
 * Waits for a project to fully load in the editor interface.
 */
export async function waitForProjectLoad(page: Page) {
	try {
		await Promise.race([
			page.waitForSelector('[data-testid="editor-loaded"]', {
				timeout: 10_000,
			}),
			page.waitForSelector('[data-testid="timeline-track"][data-track-type]', {
				timeout: 10_000,
			}),
			Promise.all([
				page.waitForSelector('[data-testid="timeline-track"]', {
					timeout: 10_000,
				}),
				page.waitForSelector(
					'[data-testid="media-panel"], [data-testid="import-media-button"]',
					{ timeout: 10_000 }
				),
			]),
		]);
	} catch (error) {
		await page.waitForSelector('[data-testid="timeline-track"]', {
			timeout: 15_000,
		});
	}
}

/**
 * Creates a new test project with the specified name.
 */
export async function createTestProject(
	page: Page,
	projectName = "E2E Test Project"
) {
	await page.waitForSelector(
		'[data-testid="new-project-button"], [data-testid="new-project-button-mobile"], [data-testid="new-project-button-empty-state"]',
		{ state: "attached", timeout: 5000 }
	);

	await page.waitForLoadState("domcontentloaded", { timeout: 3000 });

	const emptyStateButton = page.getByTestId("new-project-button-empty-state");
	const hasEmptyState = (await emptyStateButton.count()) > 0;

	if (hasEmptyState && (await emptyStateButton.isVisible())) {
		await emptyStateButton.click();
	} else {
		const visibleButton = page
			.locator(
				'[data-testid="new-project-button"]:visible, [data-testid="new-project-button-mobile"]:visible'
			)
			.first();

		if ((await visibleButton.count()) > 0) {
			await visibleButton.click();
		} else {
			const anyButton = page.locator('[data-testid*="new-project"]').first();
			await anyButton.click();
		}
	}

	const nameInput = page.getByTestId("project-name-input");
	if (await nameInput.isVisible({ timeout: 2000 })) {
		await nameInput.fill(projectName);
		await page.getByTestId("create-project-confirm").click();

		await page.waitForSelector('[data-testid="timeline-track"]', {
			timeout: 10_000,
		});
	} else {
		await page.waitForSelector(
			'[data-testid="timeline-track"], [data-testid="editor-container"]',
			{ timeout: 10_000 }
		);
	}

	await page.keyboard.press("Escape");
	await page.keyboard.press("Escape");

	await page.waitForTimeout(500);

	try {
		await page.waitForFunction(
			() => {
				const backdrops = document.querySelectorAll(
					'[data-state="open"][aria-hidden="true"]'
				);
				console.log(`Found ${backdrops.length} open modal backdrops`);
				return backdrops.length === 0;
			},
			{ timeout: 3000 }
		);
	} catch (error) {
		console.warn("Modal backdrops still present after Escape key");
		try {
			await page.evaluate(() => {
				const backdrops = document.querySelectorAll(
					'[data-state="open"][aria-hidden="true"]'
				);
				backdrops.forEach((backdrop) => {
					backdrop.remove();
				});
			});
		} catch (e) {
			console.warn("Could not force remove backdrops");
		}
	}

	await waitForProjectLoad(page);
}

/**
 * Starts an Electron application instance for testing.
 */
export async function startElectronApp() {
	return await electron.launch({
		args: ["dist/electron/main.js"],
		env: {
			...process.env,
			NODE_ENV: "test",
			ELECTRON_DISABLE_GPU: "1",
		},
	});
}

/**
 * Gets the main window from an Electron application instance.
 */
export async function getMainWindow(electronApp: ElectronApplication) {
	const page = await electronApp.firstWindow();
	await page.waitForLoadState("domcontentloaded");
	await waitForAppReady(page);
	return page;
}

/**
 * Waits for the application to be fully ready for testing.
 */
export async function waitForAppReady(page: Page) {
	try {
		await Promise.race([
			page.waitForSelector('[data-testid="app-ready"]', { timeout: 10_000 }),
			page.waitForSelector(
				'[data-testid="new-project-button"], [data-testid="project-list"]',
				{ timeout: 10_000 }
			),
			page.waitForSelector(".app-container, #root", { timeout: 10_000 }),
		]);
	} catch (error) {
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		await page.waitForFunction(
			() => {
				return (
					document.body &&
					(document.querySelector("[data-testid]") ||
						document.querySelector("#root") ||
						document.querySelector(".app-container"))
				);
			},
			{ timeout: 5000 }
		);
	}
}

// Re-export helpers from sub-modules so existing imports continue to work
export {
	ensureMediaTabActive,
	ensurePanelTabActive,
	ensureTextTabActive,
	ensureStickersTabActive,
	uploadTestMedia,
	importTestVideo,
	importTestAudio,
	importTestImage,
	addStickerToCanvas,
} from "./e2e-panel-helpers.js";

export {
	startScreenRecordingForE2E,
	stopScreenRecordingForE2E,
	startExport,
	waitForExportProgress,
} from "./e2e-export-helpers.js";
