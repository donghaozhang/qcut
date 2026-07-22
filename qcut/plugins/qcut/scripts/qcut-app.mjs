import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, win32 } from "node:path";
import { spawn as spawnProcess, spawnSync } from "node:child_process";

export const QCUT_PRODUCT_NAME = "QCut AI Video Editor";
export const QCUT_BUNDLE_ID = "com.qcut.videoeditor";

function createAsarAppCandidate({
	platform,
	appPath,
	executablePath,
	resourcesPath,
}) {
	const archivePath = join(resourcesPath, "app.asar");
	return {
		platform,
		appPath,
		executablePath,
		archivePath,
		packageJsonPath: join(archivePath, "package.json"),
		cli: {
			command: executablePath,
			prefixArgs: [join(archivePath, "electron/native-pipeline/cli/cli.js")],
			source: "installed-app",
			env: { ELECTRON_RUN_AS_NODE: "1" },
		},
	};
}

function createMacCandidate({ appPath }) {
	return createAsarAppCandidate({
		platform: "darwin",
		appPath,
		executablePath: join(appPath, "Contents", "MacOS", QCUT_PRODUCT_NAME),
		resourcesPath: join(appPath, "Contents", "Resources"),
	});
}

function createWindowsCandidate({ executablePath }) {
	return createAsarAppCandidate({
		platform: "win32",
		appPath: dirname(executablePath),
		executablePath,
		resourcesPath: win32.join(dirname(executablePath), "resources"),
	});
}

function createLinuxCandidate({ executablePath, resourcesPath }) {
	return createAsarAppCandidate({
		platform: "linux",
		appPath: dirname(executablePath),
		executablePath,
		resourcesPath,
	});
}

function createStandaloneAppCandidate({ platform, executablePath }) {
	return {
		platform,
		appPath: executablePath,
		executablePath,
		archivePath: null,
		packageJsonPath: null,
		cli: null,
	};
}

function deduplicateCandidates({ candidates }) {
	const seen = new Set();
	const unique = [];
	for (const candidate of candidates) {
		if (seen.has(candidate.executablePath)) continue;
		seen.add(candidate.executablePath);
		unique.push(candidate);
	}
	return unique;
}

function macCandidates({ env, home }) {
	const appNames = [`${QCUT_PRODUCT_NAME}.app`, "QCut.app"];
	const paths = [];
	if (env.QCUT_APP_PATH) paths.push(env.QCUT_APP_PATH);
	for (const appName of appNames) {
		paths.push(join("/Applications", appName));
		paths.push(join(home, "Applications", appName));
	}
	return paths.map((appPath) => createMacCandidate({ appPath }));
}

function windowsCandidates({ env, home }) {
	const roots = [
		env.LOCALAPPDATA,
		env.PROGRAMFILES,
		env["PROGRAMFILES(X86)"],
		win32.join(home, "AppData", "Local"),
	].filter(Boolean);
	const executablePaths = [];
	if (env.QCUT_APP_PATH) {
		executablePaths.push(
			env.QCUT_APP_PATH.toLowerCase().endsWith(".exe")
				? env.QCUT_APP_PATH
				: win32.join(env.QCUT_APP_PATH, `${QCUT_PRODUCT_NAME}.exe`)
		);
	}
	for (const root of roots) {
		for (const directory of [QCUT_PRODUCT_NAME, "qcut"]) {
			executablePaths.push(
				win32.join(
					root,
					root === env.LOCALAPPDATA ? "Programs" : "",
					directory,
					`${QCUT_PRODUCT_NAME}.exe`
				)
			);
		}
	}
	return executablePaths.map((executablePath) =>
		createWindowsCandidate({ executablePath })
	);
}

function linuxCandidates({ env }) {
	const candidates = [];
	if (env.QCUT_APP_PATH) {
		const executablePath = env.QCUT_APP_PATH;
		if (executablePath.endsWith(".AppImage")) {
			candidates.push(
				createStandaloneAppCandidate({ platform: "linux", executablePath })
			);
		} else {
			const resourcesPath = join(dirname(executablePath), "resources");
			candidates.push(createLinuxCandidate({ executablePath, resourcesPath }));
		}
	}
	for (const root of [
		join("/opt", QCUT_PRODUCT_NAME),
		"/opt/qcut",
		"/usr/lib/qcut",
	]) {
		for (const executableName of ["qcut", QCUT_PRODUCT_NAME]) {
			candidates.push(
				createLinuxCandidate({
					executablePath: join(root, executableName),
					resourcesPath: join(root, "resources"),
				})
			);
		}
	}
	return candidates;
}

export function getQCutAppCandidates({
	platform = process.platform,
	env = process.env,
	home = homedir(),
} = {}) {
	let candidates = [];
	if (platform === "darwin") candidates = macCandidates({ env, home });
	if (platform === "win32") candidates = windowsCandidates({ env, home });
	if (platform === "linux") candidates = linuxCandidates({ env });
	return deduplicateCandidates({ candidates });
}

function readPackagedVersion({ candidate, env, spawn = spawnSync }) {
	if (!candidate.packageJsonPath) {
		return (
			candidate.executablePath.match(/(\d{4}\.\d{1,2}\.\d{4})/)?.[1] ?? null
		);
	}
	const result = spawn(
		candidate.executablePath,
		["-p", "require(process.argv[1]).version", candidate.packageJsonPath],
		{
			env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}
	);
	if (result.status !== 0) return null;
	return String(result.stdout ?? "").trim() || null;
}

export function discoverQCutApp({
	platform = process.platform,
	arch = process.arch,
	env = process.env,
	home = homedir(),
	exists = existsSync,
	spawn = spawnSync,
	includeVersion = true,
	candidates = getQCutAppCandidates({ platform, env, home }),
} = {}) {
	for (const candidate of candidates) {
		const installed =
			exists(candidate.executablePath) &&
			(candidate.archivePath ? exists(candidate.archivePath) : true);
		if (!installed) continue;
		return {
			installed: true,
			platform,
			arch,
			path: candidate.appPath,
			executablePath: candidate.executablePath,
			version: includeVersion
				? readPackagedVersion({ candidate, env, spawn })
				: null,
			cli: candidate.cli,
		};
	}
	return {
		installed: false,
		platform,
		arch,
		path: null,
		executablePath: null,
		version: null,
		cli: null,
		searchedPaths: candidates.map((candidate) => candidate.appPath),
	};
}

export function getInstalledQCutCliCandidates({
	platform = process.platform,
	arch = process.arch,
	env = process.env,
	home = homedir(),
} = {}) {
	const app = discoverQCutApp({
		platform,
		arch,
		env,
		home,
		includeVersion: false,
	});
	return app.cli ? [app.cli] : [];
}

export function launchQCutApp({
	app,
	platform = process.platform,
	spawn = spawnProcess,
	spawnSyncImpl = spawnSync,
} = {}) {
	if (!app?.installed || !app.executablePath) {
		return { launched: false, error: "QCut is not installed." };
	}
	if (platform === "darwin") {
		const result = spawnSyncImpl("/usr/bin/open", ["-a", app.path], {
			stdio: "ignore",
		});
		return {
			launched: result.status === 0,
			...(result.status === 0
				? {}
				: { error: result.error?.message ?? "Failed to open QCut." }),
		};
	}
	try {
		const child = spawn(app.executablePath, [], {
			detached: true,
			stdio: "ignore",
		});
		child.unref();
		return { launched: true };
	} catch (error) {
		return {
			launched: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
