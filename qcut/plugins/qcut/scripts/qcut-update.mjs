import { spawn as spawnProcess, spawnSync } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import {
	chmodSync,
	copyFileSync,
	createWriteStream,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import {
	discoverQCutApp,
	launchQCutApp,
	QCUT_BUNDLE_ID,
	QCUT_PRODUCT_NAME,
} from "./qcut-app.mjs";
import {
	compareQCutVersions,
	fetchLatestQCutRelease,
	trustedReleaseUrl,
} from "./qcut-release.mjs";
import { resolveQCutCli, runQCutCommand } from "./qcut-runner.mjs";

const QCUT_MAC_TEAM_ID = "JQ3Q27U24X";

function parseJsonOutput({ output }) {
	try {
		return JSON.parse(String(output).trim());
	} catch {
		return null;
	}
}

function tryInstalledCliUpdater({ resolved, env, run }) {
	if (!resolved) return null;
	const result = run({
		resolved,
		args: ["update", "--yes", "--json"],
		env,
		stdio: "pipe",
	});
	const payload = parseJsonOutput({ output: result.stdout });
	if (result.status !== 0 || payload?.status !== "ok") return null;
	return {
		status: "ok",
		data: { source: "qcut-cli", result: payload.data },
	};
}

function digestMatches({ actual, expected }) {
	const actualBytes = Buffer.from(actual, "hex");
	const expectedBytes = Buffer.from(expected, "hex");
	return (
		actualBytes.length === expectedBytes.length &&
		timingSafeEqual(actualBytes, expectedBytes)
	);
}

export async function downloadVerifiedInstaller({
	asset,
	destinationPath,
	fetchImpl = globalThis.fetch,
}) {
	if (!/^sha256:[a-f0-9]{64}$/i.test(asset.digest ?? "")) {
		throw new Error("The official release is missing its SHA-256 digest.");
	}
	if (!Number.isFinite(asset.sizeBytes) || asset.sizeBytes <= 0) {
		throw new Error("The official release is missing its package size.");
	}
	if (!trustedReleaseUrl({ value: asset.url })) {
		throw new Error("The release package URL is not trusted.");
	}
	const response = await fetchImpl(asset.url);
	if (!response.ok || !response.body) {
		throw new Error(`Download failed with HTTP ${response.status}.`);
	}
	const partialPath = `${destinationPath}.partial-${process.pid}`;
	const output = createWriteStream(partialPath, { flags: "wx", mode: 0o600 });
	const reader = response.body.getReader();
	const hash = createHash("sha256");
	let transferred = 0;
	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) break;
			transferred += chunk.value.byteLength;
			if (transferred > asset.sizeBytes) {
				throw new Error("Download exceeded the expected package size.");
			}
			hash.update(chunk.value);
			if (!output.write(chunk.value)) await once(output, "drain");
		}
		output.end();
		await once(output, "finish");
		if (transferred !== asset.sizeBytes) {
			throw new Error("Downloaded package size does not match the release.");
		}
		if (
			!digestMatches({
				actual: hash.digest("hex"),
				expected: asset.digest.slice("sha256:".length),
			})
		) {
			throw new Error("Downloaded package failed SHA-256 verification.");
		}
		renameSync(partialPath, destinationPath);
	} catch (error) {
		output.destroy();
		rmSync(partialPath, { force: true });
		throw error;
	} finally {
		reader.releaseLock();
	}
}

function commandFailure({ label, result }) {
	const details = String(result.stderr ?? result.error?.message ?? "").trim();
	return new Error(`${label} failed${details ? `: ${details}` : ""}`);
}

function verifyMacApp({ appPath, spawnSyncImpl }) {
	const verified = spawnSyncImpl(
		"/usr/bin/codesign",
		["--verify", "--deep", "--strict", "--verbose=2", appPath],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
	);
	if (verified.status !== 0) {
		throw commandFailure({
			label: "Code signature verification",
			result: verified,
		});
	}
	const details = spawnSyncImpl(
		"/usr/bin/codesign",
		["--display", "--verbose=4", appPath],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
	);
	const signature = `${String(details.stdout ?? "")}\n${String(
		details.stderr ?? ""
	)}`;
	if (
		details.status !== 0 ||
		!signature.includes(`Identifier=${QCUT_BUNDLE_ID}`) ||
		!signature.includes(`TeamIdentifier=${QCUT_MAC_TEAM_ID}`)
	) {
		throw new Error("Downloaded app is not signed by Quriosity Pty Ltd.");
	}
}

export function replaceInstalledApp({
	stagedPath,
	targetPath,
	verify = () => {},
}) {
	const targetExists = existsSync(targetPath);
	const backupPath = join(
		dirname(targetPath),
		`.${basename(targetPath)}.backup-${process.pid}`
	);
	rmSync(backupPath, { recursive: true, force: true });
	if (targetExists) renameSync(targetPath, backupPath);
	try {
		renameSync(stagedPath, targetPath);
		verify({ appPath: targetPath });
	} catch (error) {
		rmSync(targetPath, { recursive: true, force: true });
		if (targetExists && existsSync(backupPath)) {
			renameSync(backupPath, targetPath);
		}
		throw error;
	}
	rmSync(backupPath, { recursive: true, force: true });
	return targetExists ? "replaced" : "installed";
}

function installMacArchive({
	installerPath,
	app,
	workingDirectory,
	spawnSyncImpl,
}) {
	if (extname(installerPath).toLowerCase() !== ".zip") {
		throw new Error(
			"The plugin updater requires the signed macOS ZIP package."
		);
	}
	const extractedDirectory = join(workingDirectory, "extracted");
	mkdirSync(extractedDirectory, { recursive: true });
	const extracted = spawnSyncImpl(
		"/usr/bin/ditto",
		["-x", "-k", installerPath, extractedDirectory],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
	);
	if (extracted.status !== 0) {
		throw commandFailure({ label: "Archive extraction", result: extracted });
	}
	const appName = readdirSync(extractedDirectory).find((name) =>
		name.endsWith(".app")
	);
	if (!appName) throw new Error("The update archive does not contain QCut.");
	const extractedAppPath = join(extractedDirectory, appName);
	verifyMacApp({ appPath: extractedAppPath, spawnSyncImpl });

	const targetPath = app.installed
		? app.path
		: join("/Applications", `${QCUT_PRODUCT_NAME}.app`);
	mkdirSync(dirname(targetPath), { recursive: true });
	const stagedPath = join(
		dirname(targetPath),
		`.${basename(targetPath)}.update-${process.pid}`
	);
	rmSync(stagedPath, { recursive: true, force: true });
	const staged = spawnSyncImpl(
		"/usr/bin/ditto",
		[extractedAppPath, stagedPath],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
	);
	if (staged.status !== 0) {
		throw commandFailure({ label: "App staging", result: staged });
	}
	verifyMacApp({ appPath: stagedPath, spawnSyncImpl });
	spawnSyncImpl(
		"/usr/bin/osascript",
		["-e", `tell application id "${QCUT_BUNDLE_ID}" to quit`],
		{ stdio: "ignore", timeout: 5000 }
	);
	const action = replaceInstalledApp({
		stagedPath,
		targetPath,
		verify: ({ appPath }) => verifyMacApp({ appPath, spawnSyncImpl }),
	});
	spawnSyncImpl("/usr/bin/open", [targetPath], { stdio: "ignore" });
	return { action, path: targetPath, preserveInstaller: false };
}

function installWindowsPackage({ installerPath, app, spawnImpl }) {
	const child = spawnImpl(installerPath, ["/S"], {
		detached: true,
		stdio: "ignore",
		windowsHide: true,
	});
	child.on("error", () => {});
	child.unref();
	return {
		action: "installer-started",
		path: app.path,
		preserveInstaller: true,
	};
}

function installLinuxAppImage({ installerPath, app, spawnImpl }) {
	const targetPath =
		app.installed && app.path.endsWith(".AppImage")
			? app.path
			: join(process.env.HOME ?? ".", "Applications", basename(installerPath));
	mkdirSync(dirname(targetPath), { recursive: true });
	const stagedPath = `${targetPath}.update-${process.pid}`;
	copyFileSync(installerPath, stagedPath);
	const currentMode = existsSync(targetPath)
		? statSync(targetPath).mode
		: 0o755;
	chmodSync(stagedPath, currentMode | 0o111);
	const action = replaceInstalledApp({ stagedPath, targetPath });
	const child = spawnImpl(targetPath, [], { detached: true, stdio: "ignore" });
	child.on("error", () => {});
	child.unref();
	return { action, path: targetPath, preserveInstaller: false };
}

function installLinuxDeb({ installerPath, app, spawnSyncImpl }) {
	const command =
		typeof process.getuid === "function" && process.getuid() === 0
			? "dpkg"
			: "sudo";
	const args =
		command === "dpkg" ? ["-i", installerPath] : ["dpkg", "-i", installerPath];
	const result = spawnSyncImpl(command, args, { stdio: "inherit" });
	if (result.status !== 0) {
		throw new Error("The QCut Debian package installer failed.");
	}
	return {
		action: app.installed ? "replaced" : "installed",
		path: app.path,
		preserveInstaller: false,
	};
}

function installBootstrapPackage({
	installerPath,
	app,
	workingDirectory,
	platform,
	spawnSyncImpl,
	spawnImpl,
}) {
	if (platform === "darwin") {
		return installMacArchive({
			installerPath,
			app,
			workingDirectory,
			spawnSyncImpl,
		});
	}
	if (platform === "win32") {
		return installWindowsPackage({ installerPath, app, spawnImpl });
	}
	if (platform === "linux") {
		if (installerPath.endsWith(".deb")) {
			return installLinuxDeb({ installerPath, app, spawnSyncImpl });
		}
		return installLinuxAppImage({ installerPath, app, spawnImpl });
	}
	throw new Error(`QCut updates are not supported on ${platform}.`);
}

export async function updateQCutApp({
	confirmed = false,
	platform = process.platform,
	arch = process.arch,
	env = process.env,
	app,
	resolved,
	run = runQCutCommand,
	fetchRelease = fetchLatestQCutRelease,
	download = downloadVerifiedInstaller,
	install = installBootstrapPackage,
	spawnSyncImpl = spawnSync,
	spawnImpl = spawnProcess,
} = {}) {
	if (!confirmed) {
		return {
			status: "error",
			code: "qcut:confirmation_required",
			error: "Ask the user before downloading and installing a QCut update.",
		};
	}
	const currentApp = app ?? discoverQCutApp({ platform, arch, env });
	const currentResolved =
		resolved === undefined ? resolveQCutCli({ env }) : resolved;

	const cliResult = tryInstalledCliUpdater({
		resolved: currentResolved,
		env,
		run,
	});
	if (cliResult) return cliResult;

	const latest = await fetchRelease({
		platform,
		arch,
		preferArchive: true,
		preferDeb:
			currentApp.installed &&
			currentApp.platform === "linux" &&
			!currentApp.path.endsWith(".AppImage"),
	});
	if (!latest.checked || !latest.asset || !latest.version) {
		return {
			status: "error",
			code: "qcut:update_check_failed",
			error: latest.error ?? "No compatible QCut release package was found.",
		};
	}
	const comparison = compareQCutVersions({
		current: currentApp.version,
		latest: latest.version,
	});
	if (currentApp.installed && comparison !== null && comparison >= 0) {
		return {
			status: "ok",
			data: {
				source: "plugin-bootstrap",
				updated: false,
				app: currentApp,
				latest,
			},
		};
	}

	const workingDirectory = mkdtempSync(join(tmpdir(), "qcut-plugin-update-"));
	let preserveInstaller = false;
	try {
		const installerPath = join(workingDirectory, latest.asset.name);
		await download({ asset: latest.asset, destinationPath: installerPath });
		const installation = install({
			installerPath,
			app: currentApp,
			workingDirectory,
			platform,
			spawnSyncImpl,
			spawnImpl,
		});
		preserveInstaller = installation.preserveInstaller;
		return {
			status: "ok",
			data: {
				source: "plugin-bootstrap",
				updated: true,
				previousVersion: currentApp.version,
				version: latest.version,
				installation,
			},
		};
	} catch (error) {
		return {
			status: "error",
			code: "qcut:update_failed",
			error: error instanceof Error ? error.message : String(error),
		};
	} finally {
		if (!preserveInstaller) {
			rmSync(workingDirectory, { recursive: true, force: true });
		}
	}
}
