import { spawn as spawnProcess, spawnSync } from "node:child_process";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import {
	QCUT_BUNDLE_ID,
	QCUT_MAC_TEAM_ID,
	type InstalledQCutApp,
} from "./app-update-discovery.js";

export interface QCutInstallResult {
	path: string;
	action: "installed" | "replaced" | "installer-started";
	relaunchStarted: boolean;
	preserveInstaller: boolean;
}

function commandError({
	command,
	result,
}: {
	command: string;
	result: ReturnType<typeof spawnSync>;
}): Error {
	const details = String(result.stderr ?? result.error?.message ?? "").trim();
	return new Error(`${command} failed${details ? `: ${details}` : ""}`);
}

export function verifyMacAppBundle({
	appPath,
	spawnSyncImpl = spawnSync,
}: {
	appPath: string;
	spawnSyncImpl?: typeof spawnSync;
}): void {
	const verified = spawnSyncImpl(
		"/usr/bin/codesign",
		["--verify", "--deep", "--strict", "--verbose=2", appPath],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
	);
	if (verified.status !== 0) {
		throw commandError({ command: "codesign verification", result: verified });
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
		throw new Error("Downloaded QCut app is not signed by Quriosity Pty Ltd");
	}

	const assessed = spawnSyncImpl(
		"/usr/sbin/spctl",
		["--assess", "--type", "execute", "--verbose=2", appPath],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
	);
	if (assessed.status !== 0) {
		throw commandError({ command: "Gatekeeper assessment", result: assessed });
	}
}

function findExtractedMacApp({ directory }: { directory: string }): string {
	const appName = readdirSync(directory).find((name) => name.endsWith(".app"));
	if (!appName) throw new Error("QCut update archive does not contain an app");
	return join(directory, appName);
}

function quitRunningMacApp({
	spawnSyncImpl,
}: {
	spawnSyncImpl: typeof spawnSync;
}) {
	spawnSyncImpl(
		"/usr/bin/osascript",
		["-e", `tell application id "${QCUT_BUNDLE_ID}" to quit`],
		{ stdio: "ignore", timeout: 5000 }
	);
}

export function replaceAppBundle({
	stagedPath,
	targetPath,
	verify = () => {},
}: {
	stagedPath: string;
	targetPath: string;
	verify?: ({ appPath }: { appPath: string }) => void;
}): "installed" | "replaced" {
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
	} catch (error: unknown) {
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
	noLaunch,
	spawnSyncImpl,
}: {
	installerPath: string;
	app: InstalledQCutApp;
	workingDirectory: string;
	noLaunch: boolean;
	spawnSyncImpl: typeof spawnSync;
}): QCutInstallResult {
	if (extname(installerPath).toLowerCase() !== ".zip") {
		throw new Error("QCut CLI requires the signed macOS ZIP update package");
	}
	const extractedDirectory = join(workingDirectory, "extracted");
	mkdirSync(extractedDirectory, { recursive: true });
	const extracted = spawnSyncImpl(
		"/usr/bin/ditto",
		["-x", "-k", installerPath, extractedDirectory],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
	);
	if (extracted.status !== 0) {
		throw commandError({
			command: "QCut archive extraction",
			result: extracted,
		});
	}

	const extractedAppPath = findExtractedMacApp({
		directory: extractedDirectory,
	});
	verifyMacAppBundle({ appPath: extractedAppPath, spawnSyncImpl });
	mkdirSync(dirname(app.path), { recursive: true });
	const stagedPath = join(
		dirname(app.path),
		`.${basename(app.path)}.update-${process.pid}`
	);
	rmSync(stagedPath, { recursive: true, force: true });
	const staged = spawnSyncImpl(
		"/usr/bin/ditto",
		[extractedAppPath, stagedPath],
		{
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}
	);
	if (staged.status !== 0) {
		throw commandError({ command: "QCut app staging", result: staged });
	}
	verifyMacAppBundle({ appPath: stagedPath, spawnSyncImpl });
	quitRunningMacApp({ spawnSyncImpl });
	const action = replaceAppBundle({
		stagedPath,
		targetPath: app.path,
		verify: ({ appPath }) => verifyMacAppBundle({ appPath, spawnSyncImpl }),
	});

	let relaunchStarted = false;
	if (!noLaunch) {
		const launched = spawnSyncImpl("/usr/bin/open", [app.path], {
			stdio: "ignore",
		});
		relaunchStarted = launched.status === 0;
	}
	return {
		path: app.path,
		action,
		relaunchStarted,
		preserveInstaller: false,
	};
}

function installWindowsPackage({
	installerPath,
	app,
	spawnImpl,
}: {
	installerPath: string;
	app: InstalledQCutApp;
	spawnImpl: typeof spawnProcess;
}): QCutInstallResult {
	const child = spawnImpl(installerPath, ["/S"], {
		detached: true,
		stdio: "ignore",
		windowsHide: true,
	});
	child.on("error", () => {});
	child.unref();
	return {
		path: app.path,
		action: "installer-started",
		relaunchStarted: true,
		preserveInstaller: true,
	};
}

function installLinuxAppImage({
	installerPath,
	app,
	noLaunch,
	spawnImpl,
}: {
	installerPath: string;
	app: InstalledQCutApp;
	noLaunch: boolean;
	spawnImpl: typeof spawnProcess;
}): QCutInstallResult {
	mkdirSync(dirname(app.path), { recursive: true });
	const stagedPath = `${app.path}.update-${process.pid}`;
	copyFileSync(installerPath, stagedPath);
	const currentMode = existsSync(app.path) ? statSync(app.path).mode : 0o755;
	chmodSync(stagedPath, currentMode | 0o111);
	const action = replaceAppBundle({ stagedPath, targetPath: app.path });
	let relaunchStarted = false;
	if (!noLaunch) {
		const child = spawnImpl(app.path, [], { detached: true, stdio: "ignore" });
		child.on("error", () => {});
		child.unref();
		relaunchStarted = true;
	}
	return {
		path: app.path,
		action,
		relaunchStarted,
		preserveInstaller: false,
	};
}

function installLinuxDeb({
	installerPath,
	app,
	spawnSyncImpl,
}: {
	installerPath: string;
	app: InstalledQCutApp;
	spawnSyncImpl: typeof spawnSync;
}): QCutInstallResult {
	const command =
		typeof process.getuid === "function" && process.getuid() === 0
			? "dpkg"
			: "sudo";
	const args =
		command === "dpkg" ? ["-i", installerPath] : ["dpkg", "-i", installerPath];
	const result = spawnSyncImpl(command, args, { stdio: "inherit" });
	if (result.status !== 0) {
		throw new Error("The QCut Debian package installer failed");
	}
	return {
		path: app.path,
		action: app.installed ? "replaced" : "installed",
		relaunchStarted: false,
		preserveInstaller: false,
	};
}

export function installQCutPackage({
	installerPath,
	app,
	workingDirectory,
	noLaunch = false,
	spawnSyncImpl = spawnSync,
	spawnImpl = spawnProcess,
}: {
	installerPath: string;
	app: InstalledQCutApp;
	workingDirectory: string;
	noLaunch?: boolean;
	spawnSyncImpl?: typeof spawnSync;
	spawnImpl?: typeof spawnProcess;
}): QCutInstallResult {
	if (app.kind === "mac-zip") {
		return installMacArchive({
			installerPath,
			app,
			workingDirectory,
			noLaunch,
			spawnSyncImpl,
		});
	}
	if (app.kind === "windows-nsis") {
		return installWindowsPackage({ installerPath, app, spawnImpl });
	}
	if (app.kind === "linux-appimage") {
		return installLinuxAppImage({ installerPath, app, noLaunch, spawnImpl });
	}
	return installLinuxDeb({ installerPath, app, spawnSyncImpl });
}
