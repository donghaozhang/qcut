import { describe, expect, it, vi } from "vitest";
import { CodexCliUnavailableError } from "../codex-plugin-cli";
import { createCodexPluginUpdateController } from "../codex-plugin-update-controller";
import {
	comparePluginVersions,
	fetchPluginReleasesUntilFound,
	selectLatestPluginRelease,
} from "../codex-plugin-release";

const logger = {
	log: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
};

describe("plugin release helpers", () => {
	it("compares cachebuster versions by their semantic base", () => {
		expect(
			comparePluginVersions({
				left: "1.1.0+codex.20260726",
				right: "1.1.0",
			})
		).toBe(0);
		expect(comparePluginVersions({ left: "1.2.0", right: "1.1.9" })).toBe(1);
	});

	it("selects the latest stable QCut Plugin release", () => {
		expect(
			selectLatestPluginRelease({
				releases: [
					{ tag_name: "v2026.07.26.2" },
					{ tag_name: "qcut-plugin-v1.1.0" },
					{ tag_name: "qcut-plugin-v1.2.0", draft: true },
					{ tag_name: "qcut-plugin-v1.1.1" },
				],
			})
		).toEqual({ tag: "qcut-plugin-v1.1.1", version: "1.1.1" });
	});

	it("continues through desktop release pages until it finds a plugin", async () => {
		const desktopReleases = Array.from({ length: 100 }, (_, index) => ({
			tag_name: `v2026.07.${index + 1}.1`,
		}));
		const fetchPage = vi.fn(
			async ({ page }: { page: number; perPage: number }) =>
				page === 1 ? desktopReleases : [{ tag_name: "qcut-plugin-v1.2.0" }]
		);

		const releases = await fetchPluginReleasesUntilFound({ fetchPage });

		expect(fetchPage).toHaveBeenCalledTimes(2);
		expect(selectLatestPluginRelease({ releases })).toEqual({
			tag: "qcut-plugin-v1.2.0",
			version: "1.2.0",
		});
	});
});

describe("CodexPluginUpdateController", () => {
	it("reports an installed cachebuster build as current", async () => {
		const sendToRenderer = vi.fn();
		const controller = createCodexPluginUpdateController({
			logger,
			sendToRenderer,
			runCodex: vi.fn(async () => ({
				installed: [
					{
						pluginId: "qcut@qcut",
						name: "qcut",
						marketplaceName: "qcut",
						version: "1.1.0+codex.local",
						marketplaceSource: {
							sourceType: "local",
							source: "/repo/qcut",
						},
					},
				],
			})),
			fetchPluginReleases: vi.fn(async () => [
				{ tag_name: "qcut-plugin-v1.1.0" },
			]),
		});

		await expect(controller.checkForUpdates()).resolves.toMatchObject({
			phase: "up-to-date",
			installedVersion: "1.1.0",
			latestVersion: "1.1.0",
		});
		expect(sendToRenderer).toHaveBeenCalledWith(
			expect.objectContaining({
				channel: "codex-plugin-update-state-changed",
			})
		);
	});

	it("migrates an official pinned marketplace to the latest release", async () => {
		const commands: string[][] = [];
		let version = "1.0.0";
		const runCodex = vi.fn(async ({ args }: { args: string[] }) => {
			commands.push(args);
			if (args[0] === "plugin" && args[1] === "add") version = "1.1.0";
			if (args[1] === "list") {
				return {
					installed: [
						{
							pluginId: "qcut@qcut",
							name: "qcut",
							marketplaceName: "qcut",
							version,
							marketplaceSource: {
								sourceType: "git",
								source: "https://github.com/Quriosity-agent/qcut.git",
							},
						},
					],
				};
			}
			return {};
		});
		const controller = createCodexPluginUpdateController({
			logger,
			sendToRenderer: vi.fn(),
			runCodex,
			fetchPluginReleases: vi.fn(async () => [
				{ tag_name: "qcut-plugin-v1.1.0" },
			]),
		});

		await controller.checkForUpdates();
		await expect(controller.installUpdate()).resolves.toMatchObject({
			phase: "restart-required",
			installedVersion: "1.1.0",
		});
		expect(commands).toContainEqual([
			"plugin",
			"marketplace",
			"remove",
			"qcut",
			"--json",
		]);
		expect(commands).toContainEqual([
			"plugin",
			"marketplace",
			"add",
			"Quriosity-agent/qcut",
			"--ref",
			"qcut-plugin-v1.1.0",
			"--json",
		]);
	});

	it("restores the previous official marketplace after a failed update", async () => {
		const commands: string[][] = [];
		const runCodex = vi.fn(async ({ args }: { args: string[] }) => {
			commands.push(args);
			if (args[1] === "list") {
				return {
					installed: [
						{
							pluginId: "qcut@qcut",
							name: "qcut",
							marketplaceName: "qcut",
							version: "1.0.0",
							marketplaceSource: {
								sourceType: "git",
								source: "https://github.com/Quriosity-agent/qcut.git",
							},
						},
					],
				};
			}
			if (
				args[0] === "plugin" &&
				args[1] === "marketplace" &&
				args.includes("qcut-plugin-v1.1.0")
			) {
				throw new Error("marketplace update failed");
			}
			return {};
		});
		const controller = createCodexPluginUpdateController({
			logger,
			sendToRenderer: vi.fn(),
			runCodex,
			fetchPluginReleases: vi.fn(async () => [
				{ tag_name: "qcut-plugin-v1.1.0" },
			]),
		});

		await controller.checkForUpdates();
		await expect(controller.installUpdate()).resolves.toMatchObject({
			phase: "error",
			installedVersion: "1.0.0",
		});
		expect(commands).toContainEqual([
			"plugin",
			"marketplace",
			"add",
			"Quriosity-agent/qcut",
			"--ref",
			"qcut-plugin-v1.0.0",
			"--json",
		]);
		expect(
			commands.filter(
				(args) =>
					args[0] === "plugin" &&
					args[1] === "marketplace" &&
					args[2] === "remove" &&
					args[3] === "qcut"
			)
		).toHaveLength(2);
	});

	it("reinstalls a local marketplace without replacing its source", async () => {
		const commands: string[][] = [];
		let version = "1.0.0";
		const runCodex = vi.fn(async ({ args }: { args: string[] }) => {
			commands.push(args);
			if (args[0] === "plugin" && args[1] === "add") version = "1.1.0";
			if (args[1] !== "list") return {};
			return {
				installed: [
					{
						pluginId: "qcut@qcut",
						name: "qcut",
						marketplaceName: "qcut",
						version,
						marketplaceSource: {
							sourceType: "local",
							source: "/repo/qcut",
						},
					},
				],
			};
		});
		const controller = createCodexPluginUpdateController({
			logger,
			sendToRenderer: vi.fn(),
			runCodex,
			fetchPluginReleases: vi.fn(async () => [
				{ tag_name: "qcut-plugin-v1.1.0" },
			]),
		});

		await controller.checkForUpdates();
		await expect(controller.installUpdate()).resolves.toMatchObject({
			phase: "restart-required",
			installedVersion: "1.1.0",
		});
		expect(commands).toContainEqual(["plugin", "add", "qcut@qcut", "--json"]);
		expect(commands.some((args) => args.includes("upgrade"))).toBe(false);
		expect(commands.some((args) => args.includes("remove"))).toBe(false);
	});

	it("reuses the active installation for concurrent update checks", async () => {
		let version = "1.0.0";
		let continueInstall = () => undefined;
		let markInstallStarted = () => undefined;
		const installGate = new Promise<void>((resolve) => {
			continueInstall = resolve;
		});
		const installStarted = new Promise<void>((resolve) => {
			markInstallStarted = resolve;
		});
		const runCodex = vi.fn(async ({ args }: { args: string[] }) => {
			if (args[1] === "list") {
				return {
					installed: [
						{
							pluginId: "qcut@qcut",
							name: "qcut",
							marketplaceName: "qcut",
							version,
							marketplaceSource: {
								sourceType: "local",
								source: "/repo/qcut",
							},
						},
					],
				};
			}
			if (args[0] === "plugin" && args[1] === "add") {
				markInstallStarted();
				await installGate;
				version = "1.1.0";
			}
			return {};
		});
		const controller = createCodexPluginUpdateController({
			logger,
			sendToRenderer: vi.fn(),
			runCodex,
			fetchPluginReleases: vi.fn(async () => [
				{ tag_name: "qcut-plugin-v1.1.0" },
			]),
		});
		await controller.checkForUpdates();

		const installation = controller.installUpdate();
		await installStarted;
		const listCallsBeforeConcurrentCheck = runCodex.mock.calls.filter(
			([{ args }]) => args[1] === "list"
		).length;
		const concurrentCheck = controller.checkForUpdates();
		expect(
			runCodex.mock.calls.filter(([{ args }]) => args[1] === "list")
		).toHaveLength(listCallsBeforeConcurrentCheck);

		continueInstall();
		await expect(installation).resolves.toMatchObject({
			phase: "restart-required",
			installedVersion: "1.1.0",
		});
		await expect(concurrentCheck).resolves.toMatchObject({
			phase: "restart-required",
		});
	});

	it("reports Codex as unavailable without exposing an update error", async () => {
		const controller = createCodexPluginUpdateController({
			logger,
			sendToRenderer: vi.fn(),
			runCodex: vi.fn(async () => {
				throw new CodexCliUnavailableError();
			}),
			fetchPluginReleases: vi.fn(async () => [
				{ tag_name: "qcut-plugin-v1.1.0" },
			]),
		});

		await expect(controller.checkForUpdates()).resolves.toMatchObject({
			phase: "unavailable",
			codexAvailable: false,
		});
	});
});
