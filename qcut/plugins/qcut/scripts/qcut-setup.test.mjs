import assert from "node:assert/strict";
import { test } from "node:test";
import {
	compareQCutVersions,
	fetchLatestQCutRelease,
	openExternalUrl,
	openQCutMediaPage,
	QCUT_RELEASE_PAGE,
	selectReleaseAsset,
} from "./qcut-setup.mjs";

const assets = [
	{
		name: "QCut.AI.Video.Editor-2026.7.2203-arm64.dmg",
		browser_download_url:
			"https://github.com/Quriosity-agent/qcut/releases/download/v2026.07.22.3/QCut.AI.Video.Editor-2026.7.2203-arm64.dmg",
		size: 465_421_911,
	},
	{
		name: "QCut.AI.Video.Editor-Setup-2026.7.2203.exe",
		browser_download_url:
			"https://github.com/Quriosity-agent/qcut/releases/download/v2026.07.22.3/QCut.AI.Video.Editor-Setup-2026.7.2203.exe",
		size: 410_179_391,
	},
	{
		name: "QCut.AI.Video.Editor-2026.7.2203.AppImage",
		browser_download_url:
			"https://github.com/Quriosity-agent/qcut/releases/download/v2026.07.22.3/QCut.AI.Video.Editor-2026.7.2203.AppImage",
		size: 621_636_361,
	},
	{
		name: "QCut.AI.Video.Editor-2026.7.2203-arm64.dmg.blockmap",
		browser_download_url:
			"https://github.com/Quriosity-agent/qcut/releases/download/v2026.07.22.3/QCut.AI.Video.Editor-2026.7.2203-arm64.dmg.blockmap",
	},
	{
		name: "QCut.AI.Video.Editor-2026.7.2203-arm64.dmg",
		browser_download_url: "https://example.com/untrusted.dmg",
	},
];

const resolved = {
	command: "qcut",
	prefixArgs: [],
	source: "installed-app",
	version: "1.0.0",
};

function okPayload({ command, data }) {
	return { status: "ok", data: { command, data } };
}

test("selects the official installer for each supported platform", () => {
	assert.ok(
		selectReleaseAsset({
			assets,
			platform: "darwin",
			arch: "arm64",
		})?.name.endsWith(".dmg")
	);
	assert.ok(
		selectReleaseAsset({
			assets,
			platform: "win32",
			arch: "x64",
		})?.name.endsWith(".exe")
	);
	assert.ok(
		selectReleaseAsset({
			assets,
			platform: "linux",
			arch: "x64",
		})?.name.endsWith(".AppImage")
	);
});

test("extracts the release version and reports update ordering", async () => {
	const latest = await fetchLatestQCutRelease({
		platform: "darwin",
		arch: "arm64",
		fetchImpl: async () => ({
			ok: true,
			json: async () => ({
				tag_name: "v2026.07.22.3",
				published_at: "2026-07-22T04:10:00Z",
				html_url:
					"https://github.com/Quriosity-agent/qcut/releases/tag/v2026.07.22.3",
				assets,
			}),
		}),
	});

	assert.equal(latest.version, "2026.7.2203");
	assert.equal(latest.asset.name.endsWith(".dmg"), true);
	assert.equal(
		compareQCutVersions({ current: "2026.7.1802", latest: latest.version }),
		-1
	);
	assert.equal(
		compareQCutVersions({ current: latest.version, latest: latest.version }),
		0
	);
});

test("falls back to the stable release page when the update check fails", async () => {
	const latest = await fetchLatestQCutRelease({
		fetchImpl: async () => {
			throw new Error("offline");
		},
	});

	assert.equal(latest.checked, false);
	assert.equal(latest.pageUrl, QCUT_RELEASE_PAGE);
});

test("refuses to open installer links outside the official repository", () => {
	let called = false;
	const result = openExternalUrl({
		url: "https://example.com/qcut.dmg",
		platform: "darwin",
		spawn: () => {
			called = true;
			return { status: 0 };
		},
	});

	assert.equal(result.opened, false);
	assert.equal(called, false);
});

test("returns the official download page when QCut is unavailable", async () => {
	const result = await openQCutMediaPage({
		app: { installed: false },
		resolved: null,
	});

	assert.equal(result.code, "qcut:install_required");
	assert.equal(result.data.downloadUrl, QCUT_RELEASE_PAGE);
});

test("requires project selection when multiple projects exist", async () => {
	const projects = [
		{ id: "project-a", name: "A" },
		{ id: "project-b", name: "B" },
	];
	const result = await openQCutMediaPage({
		app: { installed: false },
		resolved,
		inspect: () => ({ status: "ok" }),
		waitImpl: async () => {},
		execute: () =>
			okPayload({
				command: "editor:navigator:projects",
				data: { projects, activeProjectId: null },
			}),
	});

	assert.equal(result.code, "qcut:project_selection_required");
	assert.deepEqual(result.data.projects, projects);
});

test("launches QCut and verifies the requested media page", async () => {
	const project = { id: "project-a", name: "Project A" };
	const calls = [];
	let activationCount = 0;
	const execute = ({ args }) => {
		calls.push(args);
		if (args[0] === "editor:navigator:projects") {
			return okPayload({
				command: args[0],
				data: { projects: [project], activeProjectId: null },
			});
		}
		if (args[0] === "editor:state:snapshot") {
			return okPayload({
				command: args[0],
				data: {
					state: {
						editor: { activePanel: { group: "media" } },
						project: { activeProject: { id: project.id } },
					},
				},
			});
		}
		return okPayload({ command: args[0], data: {} });
	};
	const result = await openQCutMediaPage({
		projectId: project.id,
		platform: "darwin",
		app: {
			installed: true,
			path: "/Applications/QCut.app",
			executablePath: "/Applications/QCut.app/Contents/MacOS/QCut",
		},
		resolved,
		activate: () => {
			activationCount += 1;
			return { launched: true };
		},
		inspect: () => ({ status: "ok" }),
		execute,
		waitImpl: async () => {},
	});

	assert.equal(activationCount, 2);
	assert.equal(result.status, "ok");
	assert.equal(result.data.panel, "media");
	assert.equal(result.data.verified, true);
	assert.deepEqual(calls, [
		["editor:navigator:projects"],
		["editor:navigator:open", "--project-id", project.id],
		["editor:ui:switch-panel", "--panel", "video-edit"],
		["editor:ui:switch-panel", "--panel", "media"],
		["editor:state:snapshot", "--include", "editor,project"],
	]);
});
