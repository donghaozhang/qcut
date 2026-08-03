import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverInstalledQCutApp } from "../../app-update-discovery.js";
import { installQCutPackage } from "../../app-update-install.js";
import {
	compareQCutPackageVersions,
	downloadQCutReleaseAsset,
	fetchLatestQCutRelease,
} from "../../app-update-release.js";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";

export async function handleAppUpdate(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const workingDirectory = mkdtempSync(join(tmpdir(), "qcut-update-"));
	let preserveInstaller = false;
	try {
		const app = discoverInstalledQCutApp();
		onProgress({
			stage: "check",
			percent: 0,
			message: "Checking the latest official QCut release",
		});
		const release = await fetchLatestQCutRelease({
			kind: app.kind,
			signal,
		});
		const updateAvailable =
			!app.installed ||
			!app.version ||
			compareQCutPackageVersions({
				current: app.version,
				latest: release.version,
			}) < 0;
		const baseData = {
			installed: app.installed,
			appPath: app.path,
			currentVersion: app.version,
			latestVersion: release.version,
			tagName: release.tagName,
			pageUrl: release.pageUrl,
			asset: {
				name: release.asset.name,
				size: release.asset.size,
				digest: release.asset.digest,
			},
			updateAvailable,
		};

		if (!updateAvailable) {
			onProgress({
				stage: "complete",
				percent: 100,
				message: "QCut is already up to date",
			});
			return { success: true, data: baseData };
		}

		const confirmed = options.yes || options.force;
		if (options.checkOnly || !confirmed) {
			return {
				success: true,
				data: {
					...baseData,
					requiresConfirmation: true,
					installCommand: "qcut update --yes",
				},
			};
		}

		const installerPath = join(workingDirectory, release.asset.name);
		await downloadQCutReleaseAsset({
			asset: release.asset,
			destinationPath: installerPath,
			signal,
			onProgress: ({ transferred, total }) => {
				const percent = total > 0 ? Math.round((transferred / total) * 90) : 0;
				onProgress({
					stage: "download",
					percent,
					message: `Downloading QCut ${release.version}`,
				});
			},
		});
		onProgress({
			stage: "install",
			percent: 95,
			message: "Installing the verified QCut update",
		});
		const installation = installQCutPackage({
			installerPath,
			app,
			workingDirectory,
			noLaunch: options.noLaunch,
		});
		preserveInstaller = installation.preserveInstaller;
		onProgress({
			stage: "complete",
			percent: 100,
			message: `QCut ${release.version} update started successfully`,
		});
		return {
			success: true,
			data: {
				...baseData,
				updateAvailable: false,
				updated: true,
				installation,
			},
		};
	} catch (error: unknown) {
		return {
			success: false,
			error: `QCut update failed: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	} finally {
		if (!preserveInstaller) {
			rmSync(workingDirectory, { recursive: true, force: true });
		}
	}
}
