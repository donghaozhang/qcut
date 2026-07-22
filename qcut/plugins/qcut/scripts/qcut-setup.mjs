#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { discoverQCutApp, launchQCutApp } from "./qcut-app.mjs";
import { inspectQCut, resolveQCutCli, runQCutCommand } from "./qcut-runner.mjs";

export const QCUT_RELEASE_API =
	"https://api.github.com/repos/Quriosity-agent/qcut/releases/latest";
export const QCUT_RELEASE_PAGE =
	"https://github.com/Quriosity-agent/qcut/releases/latest";

function trustedReleaseUrl({ value }) {
	try {
		const url = new URL(value);
		return (
			url.protocol === "https:" &&
			url.hostname === "github.com" &&
			url.pathname.startsWith("/Quriosity-agent/qcut/releases/download/")
		);
	} catch {
		return false;
	}
}

function trustedReleasePageUrl({ value }) {
	try {
		const url = new URL(value);
		return (
			url.protocol === "https:" &&
			url.hostname === "github.com" &&
			(url.pathname === "/Quriosity-agent/qcut/releases/latest" ||
				url.pathname.startsWith("/Quriosity-agent/qcut/releases/tag/"))
		);
	} catch {
		return false;
	}
}

function downloadableAssets({ assets }) {
	return assets.filter(
		(asset) =>
			typeof asset?.name === "string" &&
			typeof asset?.browser_download_url === "string" &&
			trustedReleaseUrl({ value: asset.browser_download_url }) &&
			!asset.name.endsWith(".blockmap") &&
			!asset.name.endsWith(".yml") &&
			asset.name !== "SHA256SUMS.txt"
	);
}

function firstMatchingAsset({ assets, matchers }) {
	for (const matcher of matchers) {
		const asset = assets.find(matcher);
		if (asset) return asset;
	}
	return null;
}

export function selectReleaseAsset({
	assets = [],
	platform = process.platform,
	arch = process.arch,
} = {}) {
	const available = downloadableAssets({ assets });
	if (platform === "darwin") {
		return firstMatchingAsset({
			assets: available,
			matchers: [
				(asset) =>
					asset.name.endsWith(".dmg") && asset.name.includes(`-${arch}`),
				(asset) =>
					asset.name.endsWith("-mac.zip") && asset.name.includes(`-${arch}-`),
			],
		});
	}
	if (platform === "win32") {
		return firstMatchingAsset({
			assets: available,
			matchers: [
				(asset) =>
					asset.name.includes("-Setup-") && asset.name.endsWith(".exe"),
			],
		});
	}
	if (platform === "linux") {
		return firstMatchingAsset({
			assets: available,
			matchers: [
				(asset) => asset.name.endsWith(".AppImage"),
				(asset) => asset.name.endsWith("_amd64.deb"),
			],
		});
	}
	return null;
}

function versionFromAsset({ asset, tagName }) {
	const assetMatch = asset?.name?.match(/(\d{4}\.\d{1,2}\.\d{4})/);
	if (assetMatch) return assetMatch[1];
	const tagMatch = tagName?.match(/v?(\d{4})\.(\d{1,2})\.(\d{1,2})\.(\d+)/);
	if (!tagMatch) return null;
	const [, year, month, day, build] = tagMatch;
	return `${Number(year)}.${Number(month)}.${Number(day) * 100 + Number(build)}`;
}

export function compareQCutVersions({ current, latest }) {
	if (!current || !latest) return null;
	const currentParts = current.split(".").map(Number);
	const latestParts = latest.split(".").map(Number);
	const length = Math.max(currentParts.length, latestParts.length);
	for (let index = 0; index < length; index += 1) {
		const difference = (currentParts[index] ?? 0) - (latestParts[index] ?? 0);
		if (difference !== 0) return Math.sign(difference);
	}
	return 0;
}

export async function fetchLatestQCutRelease({
	fetchImpl = globalThis.fetch,
	platform = process.platform,
	arch = process.arch,
	timeoutMs = 10_000,
} = {}) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(QCUT_RELEASE_API, {
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": "qcut-codex-plugin",
			},
			signal: controller.signal,
		});
		if (!response.ok)
			throw new Error(`GitHub returned HTTP ${response.status}.`);
		const release = await response.json();
		const asset = selectReleaseAsset({
			assets: Array.isArray(release.assets) ? release.assets : [],
			platform,
			arch,
		});
		const pageUrl = trustedReleasePageUrl({ value: release.html_url })
			? release.html_url
			: QCUT_RELEASE_PAGE;
		return {
			checked: true,
			tagName: release.tag_name ?? null,
			version: versionFromAsset({ asset, tagName: release.tag_name }),
			publishedAt: release.published_at ?? null,
			pageUrl,
			asset: asset
				? {
						name: asset.name,
						url: asset.browser_download_url,
						sizeBytes: asset.size ?? null,
					}
				: null,
		};
	} catch (error) {
		return {
			checked: false,
			pageUrl: QCUT_RELEASE_PAGE,
			asset: null,
			error: error instanceof Error ? error.message : String(error),
		};
	} finally {
		clearTimeout(timeout);
	}
}

function publicCliInfo({ resolved, editor }) {
	if (!resolved) return { found: false, source: null, version: null };
	return {
		found: true,
		source: resolved.source,
		version: resolved.version,
		editorRunning: editor?.data?.editor?.running ?? false,
	};
}

export async function getQCutSetupStatus({
	online = true,
	platform = process.platform,
	arch = process.arch,
	env = process.env,
	cwd = process.cwd(),
	app = discoverQCutApp({ platform, arch, env }),
	resolved = resolveQCutCli({ env, cwd }),
	fetchImpl = globalThis.fetch,
} = {}) {
	const editor = resolved ? inspectQCut({ resolved, env }) : null;
	const latest = online
		? await fetchLatestQCutRelease({ fetchImpl, platform, arch })
		: null;
	const comparison = compareQCutVersions({
		current: app.version,
		latest: latest?.version,
	});
	const editorRunning = editor?.data?.editor?.running ?? false;
	let nextAction = "install";
	if (app.installed && !resolved) nextAction = "configure-cli";
	if (app.installed && resolved) {
		nextAction = editorRunning ? "open-media" : "launch";
	}
	return {
		status: "ok",
		data: {
			platform,
			arch,
			app: {
				installed: app.installed,
				path: app.path,
				version: app.version,
			},
			cli: publicCliInfo({ resolved, editor }),
			latest,
			updateAvailable: comparison === -1,
			nextAction,
		},
	};
}

function parseJsonOutput({ output }) {
	try {
		return JSON.parse(String(output).trim());
	} catch {
		return null;
	}
}

export function executeQCutJson({
	resolved,
	args,
	env = process.env,
	spawn,
} = {}) {
	const result = runQCutCommand({
		resolved,
		args: [...args, "--json"],
		env,
		spawn,
		stdio: "pipe",
	});
	const payload = parseJsonOutput({ output: result.stdout });
	if (result.status === 0 && payload?.status === "ok") return payload;
	return (
		payload ?? {
			status: "error",
			code: "qcut:invalid_response",
			error: String(result.stderr ?? "QCut command failed.").trim(),
		}
	);
}

function editorState({ payload }) {
	return payload?.data?.data?.state ?? null;
}

function navigatorState({ payload }) {
	return payload?.data?.data ?? null;
}

function wait({ milliseconds }) {
	return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

async function waitForEditor({
	resolved,
	env,
	inspect,
	waitImpl,
	attemptsRemaining,
}) {
	const result = inspect({ resolved, requireEditor: true, env });
	if (result.status === "ok") return result;
	if (attemptsRemaining <= 0) return result;
	await waitImpl({ milliseconds: 500 });
	return waitForEditor({
		resolved,
		env,
		inspect,
		waitImpl,
		attemptsRemaining: attemptsRemaining - 1,
	});
}

function selectProject({ projects, activeProjectId, requestedProjectId }) {
	if (requestedProjectId) {
		const requested = projects.find(
			(project) => project.id === requestedProjectId
		);
		return requested ? { project: requested } : { invalidProject: true };
	}
	if (activeProjectId) {
		const active = projects.find((project) => project.id === activeProjectId);
		if (active) return { project: active };
	}
	if (projects.length === 1) return { project: projects[0] };
	if (projects.length === 0) return { projectCreationRequired: true };
	return { projectSelectionRequired: true };
}

export async function openQCutMediaPage({
	projectId,
	platform = process.platform,
	env = process.env,
	app = discoverQCutApp({ platform, env }),
	resolved = resolveQCutCli({ env }),
	activate = launchQCutApp,
	inspect = inspectQCut,
	execute = executeQCutJson,
	waitImpl = wait,
} = {}) {
	if (!resolved) {
		return {
			status: "error",
			code: app.installed ? "qcut:cli_not_found" : "qcut:install_required",
			error: app.installed
				? "QCut is installed, but its CLI is not available. Set QCUT_CLI_PATH or install qcut on PATH."
				: "QCut and its CLI are not available.",
			data: { downloadUrl: QCUT_RELEASE_PAGE },
		};
	}
	if (app.installed) {
		const activation = activate({ app, platform });
		if (!activation.launched) {
			return {
				status: "error",
				code: "qcut:launch_failed",
				error: activation.error,
			};
		}
	}
	const health = await waitForEditor({
		resolved,
		env,
		inspect,
		waitImpl,
		attemptsRemaining: 30,
	});
	if (health.status !== "ok") return health;
	await waitImpl({ milliseconds: 800 });

	const projectsPayload = execute({
		resolved,
		args: ["editor:navigator:projects"],
		env,
	});
	if (projectsPayload.status !== "ok") return projectsPayload;
	const navigation = navigatorState({ payload: projectsPayload });
	const projects = Array.isArray(navigation?.projects)
		? navigation.projects
		: [];
	const selection = selectProject({
		projects,
		activeProjectId: navigation?.activeProjectId,
		requestedProjectId: projectId,
	});
	if (selection.projectCreationRequired) {
		return {
			status: "error",
			code: "qcut:project_creation_required",
			error: "No QCut projects exist yet.",
			data: { projects: [] },
		};
	}
	if (selection.projectSelectionRequired || selection.invalidProject) {
		return {
			status: "error",
			code: selection.invalidProject
				? "qcut:project_not_found"
				: "qcut:project_selection_required",
			error: selection.invalidProject
				? "The requested QCut project was not found."
				: "Choose a QCut project before opening the media page.",
			data: { projects },
		};
	}

	const project = selection.project;
	if (navigation?.activeProjectId !== project.id) {
		const opened = execute({
			resolved,
			args: ["editor:navigator:open", "--project-id", project.id],
			env,
		});
		if (opened.status !== "ok") return opened;
	}
	const editorShell = execute({
		resolved,
		args: ["editor:ui:switch-panel", "--panel", "video-edit"],
		env,
	});
	if (editorShell.status !== "ok") return editorShell;
	await waitImpl({ milliseconds: 500 });
	const mediaPanel = execute({
		resolved,
		args: ["editor:ui:switch-panel", "--panel", "media"],
		env,
	});
	if (mediaPanel.status !== "ok") return mediaPanel;
	await waitImpl({ milliseconds: 800 });
	const statePayload = execute({
		resolved,
		args: ["editor:state:snapshot", "--include", "editor,project"],
		env,
	});
	if (statePayload.status !== "ok") return statePayload;
	const state = editorState({ payload: statePayload });
	const activePanel = state?.editor?.activePanel?.group;
	const activeProjectId = state?.project?.activeProject?.id;
	if (activePanel !== "media" || activeProjectId !== project.id) {
		return {
			status: "error",
			code: "qcut:media_page_not_verified",
			error: "QCut did not reach the requested project's media page.",
			data: { activePanel, activeProjectId, requestedProjectId: project.id },
		};
	}
	if (app.installed) {
		const focus = activate({ app, platform });
		if (!focus.launched) {
			return {
				status: "error",
				code: "qcut:focus_failed",
				error: focus.error,
			};
		}
	}
	return {
		status: "ok",
		data: {
			project,
			panel: activePanel,
			verified: true,
			cli: {
				source: resolved.source,
				version: resolved.version,
			},
		},
	};
}

export function openExternalUrl({
	url,
	platform = process.platform,
	spawn = spawnSync,
} = {}) {
	if (
		!trustedReleaseUrl({ value: url }) &&
		!trustedReleasePageUrl({ value: url })
	) {
		return { opened: false, error: "Refusing to open an untrusted URL." };
	}
	let command = "xdg-open";
	let args = [url];
	if (platform === "darwin") command = "/usr/bin/open";
	if (platform === "win32") {
		command = "rundll32.exe";
		args = ["url.dll,FileProtocolHandler", url];
	}
	const result = spawn(command, args, { stdio: "ignore" });
	return {
		opened: result.status === 0,
		...(result.status === 0
			? {}
			: { error: result.error?.message ?? "Failed to open download link." }),
	};
}

function printJson({ payload, stream = process.stdout }) {
	stream.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function optionValue({ args, name }) {
	const index = args.indexOf(name);
	return index === -1 ? null : (args[index + 1] ?? null);
}

async function main() {
	const args = process.argv.slice(2);
	const command = args[0] ?? "status";
	if (command === "status") {
		printJson({
			payload: await getQCutSetupStatus({
				online: !args.includes("--offline"),
			}),
		});
		return;
	}
	if (command === "launch") {
		const app = discoverQCutApp();
		const result = launchQCutApp({ app });
		printJson({
			payload: result.launched
				? { status: "ok", data: { app, launched: true } }
				: {
						status: "error",
						code: "qcut:launch_failed",
						error: result.error,
						data: { downloadUrl: QCUT_RELEASE_PAGE },
					},
		});
		process.exitCode = result.launched ? 0 : 1;
		return;
	}
	if (command === "open-download") {
		if (!args.includes("--confirm")) {
			printJson({
				stream: process.stderr,
				payload: {
					status: "error",
					code: "qcut:confirmation_required",
					error: "Ask the user before opening the QCut installer download.",
				},
			});
			process.exitCode = 2;
			return;
		}
		const latest = await fetchLatestQCutRelease();
		const url = latest.asset?.url ?? latest.pageUrl;
		const opened = openExternalUrl({ url });
		printJson({
			payload: opened.opened
				? { status: "ok", data: { latest, opened: true, url } }
				: { status: "error", code: "qcut:open_failed", error: opened.error },
		});
		process.exitCode = opened.opened ? 0 : 1;
		return;
	}
	if (command === "open-media") {
		const result = await openQCutMediaPage({
			projectId: optionValue({ args, name: "--project-id" }),
		});
		printJson({
			payload: result,
			stream: result.status === "ok" ? process.stdout : process.stderr,
		});
		process.exitCode = result.status === "ok" ? 0 : 1;
		return;
	}
	printJson({
		stream: process.stderr,
		payload: {
			status: "error",
			code: "qcut:unknown_setup_command",
			error: `Unknown setup command: ${command}`,
		},
	});
	process.exitCode = 2;
}

const isEntryPoint =
	process.argv[1] &&
	realpathSync(resolve(process.argv[1])) ===
		realpathSync(fileURLToPath(import.meta.url));
if (isEntryPoint) {
	main().catch((error) => {
		printJson({
			stream: process.stderr,
			payload: {
				status: "error",
				code: "qcut:setup_failed",
				error: error instanceof Error ? error.message : String(error),
			},
		});
		process.exitCode = 1;
	});
}
