/**
 * Electron E2E Testing Helpers
 *
 * This module provides Playwright fixtures and helper functions for testing
 * Electron applications, specifically designed for QCut video editor E2E tests.
 */

import { test as base, Page } from "@playwright/test";
import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { ElectronApplication, _electron as electron } from "playwright";
import { resolve as pathResolve } from "path";
import ffmpegStaticPath from "ffmpeg-static";

/**
 * Resolve media fixture paths relative to the project root
 */
const mediaPath = (file: string) =>
	pathResolve(process.cwd(), "apps/web/src/test/e2e/fixtures/media", file);

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
 * Electron-specific test fixtures that extend Playwright's base fixtures
 * with Electron application and page instances.
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
 *
 * @param page - The Playwright page instance
 */
export async function cleanupDatabase(page: Page) {
	try {
		// Check if page is still open before attempting cleanup
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

			// Clear all IndexedDB databases
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
								resolve(); // Resolve anyway to prevent hanging
							};
						});
					}
					return Promise.resolve();
				})
			);

			// Count localStorage items before clearing
			stats.localStorageItems = localStorage.length;
			if (stats.localStorageItems > 0) {
				console.log(
					`📦 Clearing ${stats.localStorageItems} localStorage item(s)`
				);
				localStorage.clear();
			}

			// Count sessionStorage items before clearing
			stats.sessionStorageItems = sessionStorage.length;
			if (stats.sessionStorageItems > 0) {
				console.log(
					`📦 Clearing ${stats.sessionStorageItems} sessionStorage item(s)`
				);
				sessionStorage.clear();
			}

			// Clear any service worker caches if present
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

		// Clear Electron file system storage (project .json files)
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
			// Continue anyway - not critical
		}

		// Print summary
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

			// Log database name samples for debugging
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
		// Don't throw - allow test to continue even if cleanup partially fails
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

		// Enable console log capture from renderer process
		page.on("console", (msg) => {
			const type = msg.type();
			const text = msg.text();

			// Log renderer console messages with prefix for clarity
			const prefix = `[RENDERER ${type.toUpperCase()}]`;

			if (type === "error") {
				console.error(`${prefix} ${text}`);
			} else if (type === "warning") {
				console.warn(`${prefix} ${text}`);
			} else {
				console.log(`${prefix} ${text}`);
			}
		});

		// Capture page errors (like script loading failures)
		page.on("pageerror", (error) => {
			console.error(`[RENDERER PAGE ERROR] ${error.message}`);
			console.error(error.stack);
		});

		// Capture request failures
		page.on("requestfailed", (request) => {
			console.error(
				`[RENDERER REQUEST FAILED] ${request.url()} - ${request.failure()?.errorText}`
			);
		});

		// Wait for the app to be ready using proper state-based waiting
		await page.waitForLoadState("domcontentloaded");

		// Wait for React to mount - check for root element to have content
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
			// Log page content for debugging
			const html = await page.content();
			console.log("Page HTML length:", html.length);
			const bodyContent = await page.evaluate(
				() => document.body?.innerHTML?.substring(0, 500) || "No body"
			);
			console.log("Body content preview:", bodyContent);
		}

		// Clean up any leftover data from previous test runs BEFORE starting test
		await cleanupDatabase(page);

		// Skip onboarding/welcome screen for all E2E tests
		// Set the flag AFTER cleanup so tests don't see the "Welcome to QCut Beta" modal
		await page.evaluate(() => {
			localStorage.setItem("hasSeenOnboarding", "true");
		});

		// Navigate to projects page for E2E testing
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

			// Clean up after test completes to ensure next test starts fresh
			await cleanupDatabase(page);
		}
	},
});

export { expect } from "@playwright/test";

/**
 * Helper functions for common E2E operations
 */

/**
 * Navigates from home page to projects page for E2E testing.
 * Handles the initial app state and ensures we're on the projects page.
 *
 * @param page - The Playwright page instance
 * @throws {Error} When navigation to projects page fails
 */
export async function navigateToProjects(page: Page) {
	try {
		// First wait for the home page to load
		await page.waitForLoadState("networkidle", { timeout: 10_000 });

		// Check if we're already on projects page (look for any project creation button)
		const anyProjectButton = page.locator(
			'[data-testid="new-project-button"], [data-testid="new-project-button-mobile"], [data-testid="new-project-button-empty-state"]'
		);
		if (await anyProjectButton.first().isVisible({ timeout: 2000 })) {
			// Already on projects page
			return;
		}

		// Look for the "Try early beta" button on the home page
		const tryBetaButton = page.locator('a[href="/projects"] button', {
			hasText: "Try early beta",
		});
		if (await tryBetaButton.isVisible({ timeout: 5000 })) {
			await tryBetaButton.click();
		} else {
			// Alternative: try to navigate directly via TanStack Router
			await page.evaluate(() => {
				// Use TanStack Router's navigation if available
				const router = (window as any).router;
				if (router && router.navigate) {
					router.navigate({ to: "/projects" });
				} else {
					// Fallback: modify location hash since TanStack Router uses hash routing
					window.location.hash = "#/projects";
				}
			});
		}

		// Wait for projects page to load (any of the project buttons or project list) - use attached state for hidden responsive elements
		await page.waitForSelector(
			'[data-testid="new-project-button"], [data-testid="new-project-button-mobile"], [data-testid="new-project-button-empty-state"], [data-testid="project-list"]',
			{ timeout: 10_000, state: "attached" }
		);
	} catch (error) {
		console.warn(
			"Navigation to projects page failed, continuing anyway:",
			error
		);
		// Don't throw - let individual tests handle missing elements
	}
}

/**
 * Waits for a project to fully load in the editor interface.
 * Uses multiple fallback strategies to ensure reliable waiting.
 *
 * @param page - The Playwright page instance
 * @throws {Error} When project fails to load within timeout
 */
export async function waitForProjectLoad(page: Page) {
	// Wait for editor components to indicate the project is fully loaded
	try {
		await Promise.race([
			page.waitForSelector('[data-testid="editor-loaded"]', {
				timeout: 10_000,
			}),
			// Alternative indicators that editor is ready
			page.waitForSelector('[data-testid="timeline-track"][data-track-type]', {
				timeout: 10_000,
			}),
			// If no specific editor-loaded indicator, wait for timeline and media panel
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
		// Fallback: just ensure timeline exists
		await page.waitForSelector('[data-testid="timeline-track"]', {
			timeout: 15_000,
		});
	}
}

/**
 * Creates a new test project with the specified name.
 * Handles both header and empty state button scenarios.
 *
 * @param page - The Playwright page instance
 * @param projectName - Name for the new project (default: 'E2E Test Project')
 * @throws {Error} When project creation fails or times out
 */
export async function createTestProject(
	page: Page,
	projectName = "E2E Test Project"
) {
	// Wait for any of the project creation buttons to be in the DOM (they might be hidden by responsive CSS)
	await page.waitForSelector(
		'[data-testid="new-project-button"], [data-testid="new-project-button-mobile"], [data-testid="new-project-button-empty-state"]',
		{ state: "attached", timeout: 5000 }
	);

	// Wait for page to be stable - ensure all buttons are properly initialized
	await page.waitForLoadState("domcontentloaded", { timeout: 3000 });

	// Check if we're in empty state (no projects)
	const emptyStateButton = page.getByTestId("new-project-button-empty-state");
	const hasEmptyState = (await emptyStateButton.count()) > 0;

	if (hasEmptyState && (await emptyStateButton.isVisible())) {
		// No projects - click empty state button
		await emptyStateButton.click();
	} else {
		// Has projects - find and click the visible header button
		// Use a more specific selector that targets the visible button
		const visibleButton = page
			.locator(
				'[data-testid="new-project-button"]:visible, [data-testid="new-project-button-mobile"]:visible'
			)
			.first();

		if ((await visibleButton.count()) > 0) {
			await visibleButton.click();
		} else {
			// Last resort: click any new project button that exists
			const anyButton = page.locator('[data-testid*="new-project"]').first();
			await anyButton.click();
		}
	}

	// If there's a project creation modal, fill it out
	const nameInput = page.getByTestId("project-name-input");
	if (await nameInput.isVisible({ timeout: 2000 })) {
		await nameInput.fill(projectName);
		await page.getByTestId("create-project-confirm").click();

		// Wait for modal to close by waiting for timeline to appear
		await page.waitForSelector('[data-testid="timeline-track"]', {
			timeout: 10_000,
		});
	} else {
		// No modal - direct navigation, wait for editor elements
		await page.waitForSelector(
			'[data-testid="timeline-track"], [data-testid="editor-container"]',
			{ timeout: 10_000 }
		);
	}

	// CRITICAL FIX: Force close any lingering modals/dialogs
	// Press Escape key multiple times to dismiss any open dialogs
	await page.keyboard.press("Escape");
	await page.keyboard.press("Escape"); // Press twice to be sure

	// Wait a moment for dialogs to close
	await page.waitForTimeout(500);

	// Verify no modal backdrops are blocking interactions
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
		// Force remove backdrops if they're stuck
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

	// Wait for editor to load
	await waitForProjectLoad(page);
}

/**
 * Ensures the Library group and Media tab are active in the media panel.
 * Clicks the Library group button and then the media tab if needed.
 */
export async function ensureMediaTabActive(page: Page) {
	// Click the Library group button to switch to the media group
	const libraryGroup = page.locator('[data-testid="group-media"]');
	if ((await libraryGroup.count()) > 0) {
		await libraryGroup.click();
		await page.waitForTimeout(300);
	}
	// Click the media tab if it's not already active
	const mediaTab = page.locator('[data-testid="media-panel-tab"]');
	if ((await mediaTab.count()) > 0) {
		await mediaTab.click();
		await page.waitForTimeout(300);
	}
	// Wait for the import button to be visible
	await page.waitForSelector('[data-testid="import-media-button"]', {
		timeout: 5000,
	});
}

/**
 * Ensures the specified panel tab is active by clicking its group and tab.
 * @param page - The Playwright page instance
 * @param groupKey - The group key (e.g., 'media', 'edit', 'ai-create', 'agents')
 * @param tabKey - The tab key (e.g., 'text', 'stickers', 'pty', 'remotion')
 */
export async function ensurePanelTabActive(
	page: Page,
	groupKey: string,
	tabKey: string,
	subgroupLabel?: string
) {
	const groupButton = page.locator(`[data-testid="group-${groupKey}"]`);
	if ((await groupButton.count()) > 0) {
		await groupButton.click();
	}
	// If a subgroup label is specified (e.g., "Manual Edit", "AI Assist"), click it
	if (subgroupLabel) {
		const subgroupButton = page.locator(`button:has-text("${subgroupLabel}")`);
		if ((await subgroupButton.count()) > 0) {
			await subgroupButton.click();
		}
	}
	const tab = page.locator(`[data-testid="${tabKey}-panel-tab"]`);
	if ((await tab.count()) > 0) {
		await tab.click();
	}
}

/** Navigate to the text panel (Edit > Manual Edit > Text). */
export async function ensureTextTabActive(page: Page) {
	await ensurePanelTabActive(page, "edit", "text", "Manual Edit");
	await page.waitForSelector('[data-testid="text-panel"]', { timeout: 5000 });
}

/** Navigate to the stickers panel (Edit > Manual Edit > Stickers). */
export async function ensureStickersTabActive(page: Page) {
	await ensurePanelTabActive(page, "edit", "stickers", "Manual Edit");
	await page.waitForSelector('[data-testid="stickers-panel"]', {
		timeout: 5000,
	});
}

/**
 * Uploads test media file through the import media interface.
 * Clicks the import button and selects the specified file.
 *
 * @param page - The Playwright page instance
 * @param filePath - Relative path to the media file from project root
 * @throws {Error} When file upload fails or times out
 */
export async function uploadTestMedia(page: Page, filePath: string) {
	// Ensure the Library group and Media tab are active so import-media-button is visible
	await ensureMediaTabActive(page);

	// Get the current media item count before import
	const mediaItems = page.locator('[data-testid="media-item"]');
	const initialCount = await mediaItems.count();

	// Click the import media button to trigger file picker
	await page.getByTestId("import-media-button").click();

	// Wait for file input to be available and set the file
	const fileInput = page.locator('input[type="file"]');
	await fileInput.setInputFiles(filePath);

	// Wait for a new media item to be added (count increases)
	await page.waitForFunction(
		(expectedCount) => {
			const items = document.querySelectorAll('[data-testid="media-item"]');
			return items.length > expectedCount;
		},
		initialCount,
		{ timeout: 15_000 }
	);
}

/**
 * Imports the standard test video file (sample-video.mp4).
 * Uses the pre-created 5-second 720p test video for E2E testing.
 *
 * @param page - The Playwright page instance
 * @throws {Error} When video import fails
 */
export async function importTestVideo(page: Page) {
	const videoPath = mediaPath("sample-video.mp4");
	await uploadTestMedia(page, videoPath);
}

/**
 * Imports the standard test audio file (sample-audio.mp3).
 * Uses the pre-created 5-second sine wave test audio for E2E testing.
 *
 * @param page - The Playwright page instance
 * @throws {Error} When audio import fails
 */
export async function importTestAudio(page: Page) {
	const audioPath = mediaPath("sample-audio.mp3");
	await uploadTestMedia(page, audioPath);
}

/**
 * Imports the standard test image file (sample-image.png).
 * Uses the pre-created 1280x720 blue test image for E2E testing.
 *
 * @param page - The Playwright page instance
 * @throws {Error} When image import fails
 */
export async function importTestImage(page: Page) {
	const imagePath = mediaPath("sample-image.png");
	await uploadTestMedia(page, imagePath);
}

/**
 * Additional helper functions for the E2E tests
 */

/**
 * Starts an Electron application instance for testing.
 * Configures test environment with GPU acceleration disabled.
 *
 * @returns Promise<ElectronApplication> The launched Electron app instance
 * @throws {Error} When Electron app fails to launch
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
 * Waits for DOM content to load and app to be ready.
 *
 * @param electronApp - The Electron application instance
 * @returns Promise<Page> The main window page instance
 * @throws {Error} When main window is not accessible
 */
export async function getMainWindow(electronApp: ElectronApplication) {
	const page = await electronApp.firstWindow();
	await page.waitForLoadState("domcontentloaded");

	// Wait for app readiness using state-based waiting
	await waitForAppReady(page);

	return page;
}

/**
 * Start QCut screen recording via the renderer bridge.
 *
 * @param page - Playwright page instance
 * @param options - Optional output/source overrides
 * @returns Session metadata returned by the app
 */
export async function startScreenRecordingForE2E(
	page: Page,
	options?: {
		sourceId?: string;
		filePath?: string;
		fileName?: string;
		mimeType?: string;
	}
) {
	try {
		return await page.evaluate(async (params) => {
			const screenRecordingBridge = window.qcutScreenRecording;
			if (!screenRecordingBridge) {
				throw new Error(
					"window.qcutScreenRecording bridge is unavailable in renderer"
				);
			}
			return await screenRecordingBridge.start(params);
		}, options || {});
	} catch (error) {
		throw new Error(
			`Failed to start screen recording for E2E: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

/**
 * Stop QCut screen recording via the renderer bridge.
 *
 * @param page - Playwright page instance
 * @param options - Optional stop controls
 * @returns Final recording metadata from the app
 */
export async function stopScreenRecordingForE2E(
	page: Page,
	options?: { sessionId?: string; discard?: boolean }
) {
	try {
		return await page.evaluate(async (params) => {
			const screenRecordingBridge = window.qcutScreenRecording;
			if (!screenRecordingBridge) {
				throw new Error(
					"window.qcutScreenRecording bridge is unavailable in renderer"
				);
			}
			return await screenRecordingBridge.stop(params);
		}, options || {});
	} catch (error) {
		throw new Error(
			`Failed to stop screen recording for E2E: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

/**
 * Adds a sticker from the sticker panel to the canvas overlay.
 *
 * @param page - Playwright page instance
 * @param options - Optional position and wait settings
 * @returns True if sticker was added successfully
 */
export async function addStickerToCanvas(
	page: Page,
	options?: {
		position?: { x: number; y: number };
		waitForRender?: boolean;
	}
): Promise<boolean> {
	try {
		// Step 0: Mock Iconify API so sticker items load without network access.
		// fetchCollections() calls api.iconify.design/collections which sets error
		// state on failure, preventing the entire sticker panel from rendering.
		const MOCK_SVG =
			'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>';
		const MOCK_COLLECTIONS = JSON.stringify({
			"simple-icons": {
				prefix: "simple-icons",
				name: "Simple Icons",
				total: 20,
			},
			tabler: { prefix: "tabler", name: "Tabler Icons", total: 20 },
		});

		for (const host of [
			"https://api.iconify.design",
			"https://api.simplesvg.com",
			"https://api.unisvg.com",
		]) {
			await page.route(`${host}/**`, (route) => {
				const url = route.request().url();
				if (url.includes(".svg")) {
					route.fulfill({
						status: 200,
						contentType: "image/svg+xml",
						body: MOCK_SVG,
					});
				} else {
					route.fulfill({
						status: 200,
						contentType: "application/json",
						body: MOCK_COLLECTIONS,
					});
				}
			});
		}

		// Step 1: Switch to the "edit" group which contains the stickers tab
		const editGroup = page.locator('[data-testid="group-edit"]');
		await editGroup
			.waitFor({ state: "attached", timeout: 10_000 })
			.catch(() => {
				console.warn("Edit group tab not attached");
				return null;
			});

		if ((await editGroup.count()) === 0) {
			console.warn("Edit group tab not found");
			return false;
		}

		await editGroup.click({ force: true });
		await page.waitForTimeout(300);

		// Step 2: Click the stickers panel tab (now visible under edit group)
		const stickerTab = page.locator('[data-testid="stickers-panel-tab"]');
		await stickerTab.waitFor({ state: "attached", timeout: 5000 }).catch(() => {
			console.warn("Stickers panel tab not attached");
			return null;
		});

		if ((await stickerTab.count()) === 0) {
			console.warn(
				"Stickers panel tab not found - stickers feature may not be available"
			);
			return false;
		}

		await stickerTab.click({ force: true });

		// Step 3: Wait for stickers panel to load
		const stickersPanel = page.locator('[data-testid="stickers-panel"]');
		await stickersPanel
			.waitFor({ state: "visible", timeout: 5000 })
			.catch(() => {
				console.warn("Stickers panel did not become visible");
			});

		// Step 4: Wait for sticker items to load (fetched from Iconify API - needs network)
		const stickerItems = page.locator('[data-testid="sticker-item"]');

		// Log panel state for diagnostics
		const panelHtml = await page
			.locator('[data-testid="stickers-panel"]')
			.innerHTML()
			.catch(() => "panel not found");
		console.log(
			`[addStickerToCanvas] Panel HTML length: ${panelHtml.length}, first 200: ${panelHtml.substring(0, 200)}`
		);

		await stickerItems
			.first()
			.waitFor({ state: "visible", timeout: 15_000 })
			.catch(() => null);

		const itemCount = await stickerItems.count();
		if (itemCount === 0) {
			console.warn(
				"No sticker items found in panel - Iconify API may be unreachable"
			);
			return false;
		}
		console.log(`[addStickerToCanvas] Found ${itemCount} sticker items`);

		// Step 5: Click a sticker item to add it to media library
		// Use force:true because TooltipTrigger intercepts pointer events
		await stickerItems.first().click({ force: true });

		// Wait for the media item to be added (toast appears)
		await page.waitForTimeout(2000);

		// Step 6: Add the sticker to the overlay canvas via store
		// The stickers panel only adds to media library, not overlay,
		// so we manually call addOverlaySticker with the latest image media item
		// Uses window.stickerTest.getStores() exposed by sticker-test-helper.ts
		const added = await page.evaluate(async () => {
			const stickerTest = (window as any).stickerTest;
			if (!stickerTest?.getStores) {
				console.error("[addStickerToCanvas] window.stickerTest not available");
				return false;
			}

			const stores = stickerTest.getStores();
			if (!stores?.media?.mediaItems || !stores?.stickers?.addOverlaySticker) {
				console.error("[addStickerToCanvas] stores not ready");
				return false;
			}

			// Find the most recently added image media item
			const imageItems = stores.media.mediaItems.filter(
				(item: any) => item.type === "image"
			);
			if (imageItems.length === 0) {
				console.error("[addStickerToCanvas] no image media items found");
				return false;
			}

			const latestImage = imageItems[imageItems.length - 1];
			console.log(
				`[addStickerToCanvas] Adding overlay sticker for media: ${latestImage.name} (${latestImage.id})`
			);

			// Add to overlay
			await stores.stickers.addOverlaySticker(latestImage.id);
			return true;
		});

		if (!added) {
			console.warn(
				"Could not add sticker to overlay via store - stores may not be exposed"
			);
			return false;
		}

		// Step 7: Wait for sticker element to appear on canvas
		await page
			.locator("[data-sticker-id]")
			.first()
			.waitFor({ state: "visible", timeout: 10_000 });

		if (options?.waitForRender) {
			await page.waitForTimeout(500);
		}

		return true;
	} catch (error) {
		console.error("Failed to add sticker to canvas:", error);
		return false;
	}
}

/**
 * Opens export dialog and starts export process.
 *
 * @param page - Playwright page instance
 * @param options - Timeout and completion wait settings
 * @returns True if export started successfully
 */
export async function startExport(
	page: Page,
	options?: {
		timeout?: number;
		waitForComplete?: boolean;
	}
): Promise<boolean> {
	const timeout = options?.timeout || 30_000;

	try {
		// Open export dialog
		const exportButton = page.locator('[data-testid="export-button"]');
		await exportButton.click();

		await page.waitForSelector(
			'[data-testid*="export-dialog"], .modal, [role="dialog"]',
			{ state: "visible", timeout: 5000 }
		);

		// Start export
		const startExportButton = page.locator(
			'[data-testid="export-start-button"]'
		);
		if (await startExportButton.isVisible({ timeout: 2000 })) {
			await startExportButton.click();

			// Wait for export progress indicator
			await Promise.race([
				page
					.waitForSelector('[data-testid="export-status"]', {
						state: "visible",
						timeout,
					})
					.catch(() => null),
				page
					.waitForSelector('[data-testid="export-progress-bar"]', {
						state: "visible",
						timeout,
					})
					.catch(() => null),
			]);

			if (options?.waitForComplete) {
				// Wait for export completion
				await page.waitForFunction(
					() => {
						const status = document.querySelector(
							'[data-testid="export-status"]'
						);
						return (
							status?.textContent?.includes("complete") ||
							status?.textContent?.includes("done")
						);
					},
					{ timeout }
				);
			}

			return true;
		}

		return false;
	} catch (error) {
		console.error("Failed to start export:", error);
		return false;
	}
}

/**
 * Waits for export to complete or reach a specific progress.
 *
 * @param page - Playwright page instance
 * @param targetProgress - Progress percentage to wait for (0-100)
 * @param timeout - Maximum wait time in milliseconds
 */
export async function waitForExportProgress(
	page: Page,
	targetProgress = 100,
	timeout = 60_000
): Promise<void> {
	await page.waitForFunction(
		(target) => {
			const progressBar = document.querySelector(
				'[data-testid="export-progress-bar"]'
			);
			const progressValue = progressBar?.getAttribute("value") || "0";
			return Number.parseFloat(progressValue) >= target;
		},
		targetProgress,
		{ timeout }
	);
}

/**
 * Waits for the application to be fully ready for testing.
 * Uses multiple strategies including element detection and network idle state.
 *
 * @param page - The Playwright page instance
 * @throws {Error} When app fails to reach ready state within timeout
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
		// Fallback: wait for network idle and ensure basic DOM structure exists
		await page.waitForLoadState("networkidle", { timeout: 15_000 });

		// Verify at least basic DOM elements are present
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
