import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
	discoverQCutApp,
	getInstalledQCutCliCandidates,
	launchQCutApp,
	QCUT_PRODUCT_NAME,
} from "./qcut-app.mjs";

const tempRoot = mkdtempSync(join(tmpdir(), "qcut-app-test-"));
after(() => rmSync(tempRoot, { recursive: true, force: true }));

function createFakeMacApp() {
	const appPath = join(tempRoot, `${QCUT_PRODUCT_NAME}.app`);
	const executablePath = join(appPath, "Contents", "MacOS", QCUT_PRODUCT_NAME);
	const archivePath = join(appPath, "Contents", "Resources", "app.asar");
	mkdirSync(join(appPath, "Contents", "MacOS"), { recursive: true });
	mkdirSync(join(appPath, "Contents", "Resources"), { recursive: true });
	writeFileSync(executablePath, "", "utf8");
	writeFileSync(archivePath, "", "utf8");
	return { appPath, executablePath, archivePath };
}

test("discovers a packaged macOS app and its embedded CLI", () => {
	const fake = createFakeMacApp();
	const calls = [];
	const spawn = (command, args, options) => {
		calls.push({ command, args, options });
		return { status: 0, stdout: "2026.7.2203\n" };
	};
	const env = { QCUT_APP_PATH: fake.appPath };
	const app = discoverQCutApp({
		platform: "darwin",
		arch: "arm64",
		env,
		home: tempRoot,
		spawn,
	});

	assert.equal(app.installed, true);
	assert.equal(app.path, fake.appPath);
	assert.equal(app.version, "2026.7.2203");
	assert.equal(app.cli.command, fake.executablePath);
	assert.equal(app.cli.env.ELECTRON_RUN_AS_NODE, "1");
	assert.equal(calls[0].options.env.ELECTRON_RUN_AS_NODE, "1");
});

test("returns the embedded CLI as a runner candidate", () => {
	const fake = createFakeMacApp();
	const candidates = getInstalledQCutCliCandidates({
		platform: "darwin",
		arch: "arm64",
		env: { QCUT_APP_PATH: fake.appPath },
		home: tempRoot,
	});

	assert.equal(candidates.length, 1);
	assert.equal(candidates[0].source, "installed-app");
	assert.equal(
		candidates[0].prefixArgs[0],
		join(fake.archivePath, "electron/native-pipeline/cli/cli.js")
	);
});

test("reports searched locations when QCut is missing", () => {
	const app = discoverQCutApp({
		platform: "darwin",
		arch: "arm64",
		env: {},
		home: join(tempRoot, "missing-home"),
		exists: () => false,
	});

	assert.equal(app.installed, false);
	assert.ok(app.searchedPaths.length >= 2);
});

test("recognizes a configured Linux AppImage without claiming an embedded CLI", () => {
	const appImagePath = join(
		tempRoot,
		"QCut.AI.Video.Editor-2026.7.2203.AppImage"
	);
	writeFileSync(appImagePath, "", "utf8");
	const app = discoverQCutApp({
		platform: "linux",
		arch: "x64",
		env: { QCUT_APP_PATH: appImagePath },
		home: tempRoot,
	});

	assert.equal(app.installed, true);
	assert.equal(app.version, "2026.7.2203");
	assert.equal(app.cli, null);
});

test("launches the discovered macOS app without a shell", () => {
	const fake = createFakeMacApp();
	let observed;
	const result = launchQCutApp({
		platform: "darwin",
		app: {
			installed: true,
			path: fake.appPath,
			executablePath: fake.executablePath,
		},
		spawnSyncImpl: (command, args, options) => {
			observed = { command, args, options };
			return { status: 0 };
		},
	});

	assert.equal(result.launched, true);
	assert.equal(observed.command, "/usr/bin/open");
	assert.deepEqual(observed.args, ["-a", fake.appPath]);
});
