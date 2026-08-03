import assert from "node:assert/strict";
import { test } from "node:test";
import { downloadVerifiedInstaller, updateQCutApp } from "./qcut-update.mjs";

const oldApp = {
	installed: true,
	platform: "darwin",
	arch: "arm64",
	path: "/Applications/QCut AI Video Editor.app",
	executablePath:
		"/Applications/QCut AI Video Editor.app/Contents/MacOS/QCut AI Video Editor",
	version: "2026.8.103",
};

const latest = {
	checked: true,
	tagName: "v2026.08.02.7",
	version: "2026.8.207",
	pageUrl: "https://github.com/Quriosity-agent/qcut/releases/tag/v2026.08.02.7",
	asset: {
		name: "QCut-AI-Video-Editor-2026.8.207-arm64-mac.zip",
		url: "https://github.com/Quriosity-agent/qcut/releases/download/v2026.08.02.7/QCut-AI-Video-Editor-2026.8.207-arm64-mac.zip",
		sizeBytes: 100,
		digest: `sha256:${"a".repeat(64)}`,
	},
};

test("requires explicit confirmation before updating QCut", async () => {
	const result = await updateQCutApp({ confirmed: false });

	assert.equal(result.status, "error");
	assert.equal(result.code, "qcut:confirmation_required");
});

test("rejects bootstrap downloads without an exact package size", async () => {
	await assert.rejects(
		downloadVerifiedInstaller({
			asset: { ...latest.asset, sizeBytes: null },
			destinationPath: "/tmp/qcut-update.zip",
		}),
		/package size/
	);
});

test("rejects bootstrap downloads outside the official repository", async () => {
	await assert.rejects(
		downloadVerifiedInstaller({
			asset: { ...latest.asset, url: "https://example.com/qcut-update.zip" },
			destinationPath: "/tmp/qcut-update.zip",
		}),
		/not trusted/
	);
});

test("delegates to a QCut CLI that supports the update command", async () => {
	const result = await updateQCutApp({
		confirmed: true,
		app: oldApp,
		resolved: { command: "qcut", prefixArgs: [] },
		run: () => ({
			status: 0,
			stdout: JSON.stringify({
				status: "ok",
				data: { command: "update", data: { updated: true } },
			}),
		}),
	});

	assert.equal(result.status, "ok");
	assert.equal(result.data.source, "qcut-cli");
	assert.equal(result.data.result.data.updated, true);
});

test("does not download when the installed app is current", async () => {
	let downloaded = false;
	const result = await updateQCutApp({
		confirmed: true,
		app: { ...oldApp, version: latest.version },
		resolved: null,
		fetchRelease: async () => latest,
		download: async () => {
			downloaded = true;
		},
	});

	assert.equal(result.status, "ok");
	assert.equal(result.data.updated, false);
	assert.equal(downloaded, false);
});

test("bootstraps an old app when its embedded CLI has no updater", async () => {
	let downloaded = false;
	let installed = false;
	const result = await updateQCutApp({
		confirmed: true,
		app: oldApp,
		resolved: { command: "old-qcut", prefixArgs: [] },
		run: () => ({ status: 2, stdout: "", stderr: "Unknown command: update" }),
		fetchRelease: async () => latest,
		download: async () => {
			downloaded = true;
		},
		install: () => {
			installed = true;
			return {
				action: "replaced",
				path: oldApp.path,
				preserveInstaller: false,
			};
		},
	});

	assert.equal(result.status, "ok");
	assert.equal(result.data.source, "plugin-bootstrap");
	assert.equal(result.data.version, latest.version);
	assert.equal(downloaded, true);
	assert.equal(installed, true);
});

test("requests a Debian package when bootstrapping a Debian install", async () => {
	let releaseOptions;
	const result = await updateQCutApp({
		confirmed: true,
		platform: "linux",
		arch: "x64",
		app: {
			installed: true,
			platform: "linux",
			path: "/opt/qcut",
			version: latest.version,
		},
		resolved: null,
		fetchRelease: async (options) => {
			releaseOptions = options;
			return latest;
		},
	});

	assert.equal(result.status, "ok");
	assert.equal(releaseOptions.preferDeb, true);
});
