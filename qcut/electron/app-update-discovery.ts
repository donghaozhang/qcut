import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, win32 } from "node:path";
import type { QCutInstallationKind } from "./app-update-release.js";

export const QCUT_PRODUCT_NAME = "QCut AI Video Editor";
export const QCUT_BUNDLE_ID = "com.qcut.videoeditor";
export const QCUT_MAC_TEAM_ID = "JQ3Q27U24X";

export interface InstalledQCutApp {
	installed: boolean;
	path: string;
	executablePath?: string;
	version?: string;
	kind: QCutInstallationKind;
}

function macAppPathFromExecutable({
	executablePath,
}: {
	executablePath: string;
}): string | undefined {
	const appIndex = executablePath.indexOf(".app/");
	if (appIndex === -1) return undefined;
	return executablePath.slice(0, appIndex + ".app".length);
}

function readMacBundleVersion({
	appPath,
	spawnSyncImpl,
}: {
	appPath: string;
	spawnSyncImpl: typeof spawnSync;
}): string | undefined {
	const result = spawnSyncImpl(
		"/usr/bin/plutil",
		[
			"-extract",
			"CFBundleShortVersionString",
			"raw",
			"-o",
			"-",
			join(appPath, "Contents", "Info.plist"),
		],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
	);
	if (result.status !== 0) return undefined;
	return String(result.stdout).trim() || undefined;
}

function readAsarPackageVersion({
	executablePath,
	packageJsonPath,
	env,
	spawnSyncImpl,
}: {
	executablePath: string;
	packageJsonPath: string;
	env: NodeJS.ProcessEnv;
	spawnSyncImpl: typeof spawnSync;
}): string | undefined {
	const result = spawnSyncImpl(
		executablePath,
		["-p", "require(process.argv[1]).version", packageJsonPath],
		{
			env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			timeout: 5000,
		}
	);
	if (result.status !== 0) return undefined;
	return String(result.stdout).trim() || undefined;
}

function discoverMacApp({
	env,
	home,
	execPath,
	spawnSyncImpl,
}: {
	env: NodeJS.ProcessEnv;
	home: string;
	execPath: string;
	spawnSyncImpl: typeof spawnSync;
}): InstalledQCutApp {
	const paths = new Set<string>();
	if (env.QCUT_APP_PATH) paths.add(resolve(env.QCUT_APP_PATH));
	const currentAppPath = macAppPathFromExecutable({ executablePath: execPath });
	if (currentAppPath) paths.add(currentAppPath);
	paths.add(join("/Applications", `${QCUT_PRODUCT_NAME}.app`));
	paths.add(join(home, "Applications", `${QCUT_PRODUCT_NAME}.app`));
	paths.add(join("/Applications", "QCut.app"));
	paths.add(join(home, "Applications", "QCut.app"));

	for (const appPath of paths) {
		const executablePath = join(
			appPath,
			"Contents",
			"MacOS",
			QCUT_PRODUCT_NAME
		);
		if (!existsSync(executablePath)) continue;
		return {
			installed: true,
			path: appPath,
			executablePath,
			version: readMacBundleVersion({ appPath, spawnSyncImpl }),
			kind: "mac-zip",
		};
	}

	return {
		installed: false,
		path: join("/Applications", `${QCUT_PRODUCT_NAME}.app`),
		kind: "mac-zip",
	};
}

function discoverWindowsApp({
	env,
	home,
	execPath,
	spawnSyncImpl,
}: {
	env: NodeJS.ProcessEnv;
	home: string;
	execPath: string;
	spawnSyncImpl: typeof spawnSync;
}): InstalledQCutApp {
	const executablePaths = new Set<string>();
	if (env.QCUT_APP_PATH) {
		executablePaths.add(
			env.QCUT_APP_PATH.toLowerCase().endsWith(".exe")
				? env.QCUT_APP_PATH
				: win32.join(env.QCUT_APP_PATH, `${QCUT_PRODUCT_NAME}.exe`)
		);
	}
	if (basename(execPath).toLowerCase().includes("qcut")) {
		executablePaths.add(execPath);
	}
	const localPrograms = win32.join(
		env.LOCALAPPDATA ?? win32.join(home, "AppData", "Local"),
		"Programs"
	);
	for (const directory of [QCUT_PRODUCT_NAME, "qcut"]) {
		executablePaths.add(
			win32.join(localPrograms, directory, `${QCUT_PRODUCT_NAME}.exe`)
		);
	}

	for (const executablePath of executablePaths) {
		if (!existsSync(executablePath)) continue;
		const appPath = dirname(executablePath);
		return {
			installed: true,
			path: appPath,
			executablePath,
			version: readAsarPackageVersion({
				executablePath,
				packageJsonPath: win32.join(
					appPath,
					"resources",
					"app.asar",
					"package.json"
				),
				env,
				spawnSyncImpl,
			}),
			kind: "windows-nsis",
		};
	}

	return {
		installed: false,
		path: win32.join(localPrograms, QCUT_PRODUCT_NAME),
		kind: "windows-nsis",
	};
}

function discoverLinuxApp({
	env,
	home,
	execPath,
	spawnSyncImpl,
}: {
	env: NodeJS.ProcessEnv;
	home: string;
	execPath: string;
	spawnSyncImpl: typeof spawnSync;
}): InstalledQCutApp {
	const appImagePath = env.QCUT_APP_PATH?.endsWith(".AppImage")
		? env.QCUT_APP_PATH
		: env.APPIMAGE;
	if (appImagePath && existsSync(appImagePath)) {
		return {
			installed: true,
			path: resolve(appImagePath),
			executablePath: resolve(appImagePath),
			version: basename(appImagePath).match(/(\d{4}\.\d{1,2}\.\d{3,4})/)?.[1],
			kind: "linux-appimage",
		};
	}

	const executablePaths = new Set<string>();
	if (env.QCUT_APP_PATH) executablePaths.add(resolve(env.QCUT_APP_PATH));
	if (basename(execPath).toLowerCase().includes("qcut")) {
		executablePaths.add(execPath);
	}
	for (const root of [
		join("/opt", QCUT_PRODUCT_NAME),
		"/opt/qcut",
		"/usr/lib/qcut",
	]) {
		executablePaths.add(join(root, "qcut"));
		executablePaths.add(join(root, QCUT_PRODUCT_NAME));
	}

	for (const executablePath of executablePaths) {
		if (!existsSync(executablePath)) continue;
		const appPath = dirname(executablePath);
		return {
			installed: true,
			path: appPath,
			executablePath,
			version: readAsarPackageVersion({
				executablePath,
				packageJsonPath: join(appPath, "resources", "app.asar", "package.json"),
				env,
				spawnSyncImpl,
			}),
			kind: "linux-deb",
		};
	}

	return {
		installed: false,
		path: join(home, "Applications", `${QCUT_PRODUCT_NAME}.AppImage`),
		kind: "linux-appimage",
	};
}

export function discoverInstalledQCutApp({
	platform = process.platform,
	env = process.env,
	home = homedir(),
	execPath = process.execPath,
	spawnSyncImpl = spawnSync,
}: {
	platform?: NodeJS.Platform;
	env?: NodeJS.ProcessEnv;
	home?: string;
	execPath?: string;
	spawnSyncImpl?: typeof spawnSync;
} = {}): InstalledQCutApp {
	if (platform === "darwin") {
		return discoverMacApp({ env, home, execPath, spawnSyncImpl });
	}
	if (platform === "win32") {
		return discoverWindowsApp({ env, home, execPath, spawnSyncImpl });
	}
	if (platform === "linux") {
		return discoverLinuxApp({ env, home, execPath, spawnSyncImpl });
	}
	throw new Error(`QCut CLI updates are not supported on ${platform}`);
}
