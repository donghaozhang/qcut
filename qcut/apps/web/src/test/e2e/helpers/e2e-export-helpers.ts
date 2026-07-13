/**
 * Export and screen recording helpers for E2E tests.
 */

import { Page } from "@playwright/test";
import type { ElectronApplication } from "playwright";

/** Make Electron's native save dialog deterministic for export tests. */
export async function stubExportSaveDialog({
	electronApp,
	outputPath,
}: {
	electronApp: ElectronApplication;
	outputPath: string;
}): Promise<void> {
	await electronApp.evaluate(async ({ dialog }, selectedPath) => {
		dialog.showSaveDialog = async () => ({
			canceled: false,
			filePath: selectedPath,
		});
	}, outputPath);
}

/**
 * Query the macOS Screen Recording permission status via the Electron
 * IPC bridge. Non-macOS platforms always return "granted". E2E tests
 * should skip when this returns anything other than "granted", since
 * the real screen capture flow cannot succeed without it.
 */
export async function getScreenRecordingPermission(
	page: Page
): Promise<"granted" | "denied" | "restricted" | "not-determined" | "unknown"> {
	return await page.evaluate(async () => {
		const api = window.electronAPI?.screenRecording;
		if (!api?.getPermissionStatus) {
			return "unknown" as const;
		}
		try {
			return await api.getPermissionStatus();
		} catch {
			return "unknown" as const;
		}
	});
}

/**
 * Start QCut screen recording via the renderer bridge.
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
 * Opens export dialog and starts export process.
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
		const exportButton = page.locator('[data-testid="export-button"]');
		await exportButton.click();

		await page.waitForSelector(
			'[data-testid*="export-dialog"], .modal, [role="dialog"]',
			{ state: "visible", timeout: 5000 }
		);

		const startExportButton = page.locator(
			'[data-testid="export-start-button"]'
		);
		if (await startExportButton.isVisible({ timeout: 2000 })) {
			await startExportButton.click();

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
