import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	discardPreservedInstaller,
	findReusableInstaller,
	preserveInstallerFile,
} from "../../app-update-cache.js";
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
	// Set only after this run fully downloads and digest-verifies a package;
	// the failure path preserves that file for the next attempt.
	let downloadedInstallerPath: string | undefined;
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

		// A fully verified copy may already exist: the running app stages
		// updates through electron-updater, and a previously failed CLI run
		// preserves its download. Reusing one skips the multi-hundred-MB pull.
		// The copy is re-verified inside this run's private tmpdir, so the
		// installed bytes can no longer be swapped at the shared cache path.
		let installerPath = join(workingDirectory, release.asset.name);
		const reused = await findReusableInstaller({
			asset: release.asset,
			copyToDirectory: workingDirectory,
		});
		if (reused) {
			installerPath = reused.installerPath;
			onProgress({
				stage: "download",
				percent: 90,
				message: `Reusing the verified QCut ${release.version} package already on disk`,
			});
		} else {
			const version = release.version;
			await downloadQCutReleaseAsset({
				asset: release.asset,
				destinationPath: installerPath,
				signal,
				onProgress: ({ transferred, total }) => {
					const percent =
						total > 0 ? Math.round((transferred / total) * 90) : 0;
					onProgress({
						stage: "download",
						percent,
						message: `Downloading QCut ${version}`,
					});
				},
			});
			downloadedInstallerPath = installerPath;
		}
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
		if (reused) {
			// The install ran from the private copy, so the cache original has
			// served its purpose. Only CLI-preserved files are removed; staged
			// packages owned by the app's own updater are left alone.
			discardPreservedInstaller({ preservedPath: reused.sourcePath });
		}
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
		// Keep a fully downloaded, digest-verified package so the retry can
		// skip the download (findReusableInstaller picks it up next run).
		const preservedPath =
			downloadedInstallerPath && existsSync(downloadedInstallerPath)
				? preserveInstallerFile({ installerPath: downloadedInstallerPath })
				: undefined;
		return {
			success: false,
			error: `QCut update failed: ${
				error instanceof Error ? error.message : String(error)
			}${preservedPath ? ` (downloaded package kept at ${preservedPath}; rerun to reuse it)` : ""}`,
		};
	} finally {
		if (!preserveInstaller) {
			rmSync(workingDirectory, { recursive: true, force: true });
		}
	}
}
