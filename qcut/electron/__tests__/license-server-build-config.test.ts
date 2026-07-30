import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createLicenseServerBuildConfig,
	LICENSE_SERVER_BUILD_CONFIG_FILENAME,
	loadInitialLicenseServerRuntimeConfig,
	parseLicenseServerBuildConfig,
	readLicenseServerBuildConfig,
	refreshLicenseServerRuntimeConfig,
	resolveLicenseServerBuildConfigPath,
	resolveLicenseServerDevelopmentCacheDirectory,
	resolveLicenseServerDevelopmentConfigPath,
	resolveLicenseServerRuntimeConfigLocation,
	serializeLicenseServerBuildConfig,
	writeLicenseServerBuildConfig,
} from "../license-server-build-config.js";
import { DEFAULT_LICENSE_SERVER_ORIGIN } from "../license-server-csp.js";

const temporaryDirectories: string[] = [];

function createTemporaryConfigFile({ contents }: { contents: string }): string {
	const directory = mkdtempSync(path.join(tmpdir(), "qcut-license-config-"));
	temporaryDirectories.push(directory);
	const configPath = path.join(directory, LICENSE_SERVER_BUILD_CONFIG_FILENAME);
	writeFileSync(configPath, contents, "utf8");
	return configPath;
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("license server build config", () => {
	it("uses production when no custom URL is configured", () => {
		expect(createLicenseServerBuildConfig({})).toEqual({
			licenseServerUrl: DEFAULT_LICENSE_SERVER_ORIGIN,
		});
	});

	it("normalizes an allowed URL to its origin", () => {
		expect(
			createLicenseServerBuildConfig({
				configuredUrl:
					"https://user:secret@staging.example.com:8443/api?token=secret#fragment",
			})
		).toEqual({
			licenseServerUrl: "https://staging.example.com:8443",
		});
	});

	it.each([
		"http://license.example.com",
		"http://[::1]:3000",
		"ws://localhost:3000",
		"javascript:alert(1)",
		"not a URL",
	])("fails the build for unsafe configured URL %s", (configuredUrl) => {
		expect(() =>
			createLicenseServerBuildConfig({ configuredUrl })
		).toThrowError(
			"VITE_LICENSE_SERVER_URL must use HTTPS or local HTTP on localhost/127.0.0.1"
		);
	});

	it("round-trips the generated artifact", () => {
		const buildConfig = createLicenseServerBuildConfig({
			configuredUrl: "http://127.0.0.1:8787/api",
		});
		const serializedConfig = serializeLicenseServerBuildConfig({
			buildConfig,
		});

		expect(parseLicenseServerBuildConfig({ serializedConfig })).toEqual({
			licenseServerUrl: "http://127.0.0.1:8787",
		});
	});

	it.each([
		"not json",
		"null",
		"[]",
		"{}",
		'{"licenseServerUrl":1}',
		'{"licenseServerUrl":"http://license.example.com"}',
		'{"licenseServerUrl":"https://safe.example.com/path"}',
	])("rejects malformed or non-normalized artifact %s", (serializedConfig) => {
		expect(parseLicenseServerBuildConfig({ serializedConfig })).toBeNull();
	});

	it("reads a valid generated artifact", () => {
		const buildConfig = createLicenseServerBuildConfig({
			configuredUrl: "https://staging.example.com/api",
		});
		const configPath = createTemporaryConfigFile({
			contents: serializeLicenseServerBuildConfig({ buildConfig }),
		});

		expect(readLicenseServerBuildConfig({ configPath })).toEqual({
			licenseServerUrl: "https://staging.example.com",
		});
	});

	it("writes a validated config into a generated directory", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "qcut-license-write-"));
		temporaryDirectories.push(directory);
		const configPath = path.join(
			directory,
			"nested",
			LICENSE_SERVER_BUILD_CONFIG_FILENAME
		);
		const buildConfig = createLicenseServerBuildConfig({
			configuredUrl: "https://user:secret@staging.example.com/api?token=secret",
		});

		writeLicenseServerBuildConfig({ buildConfig, configPath });

		expect(readLicenseServerBuildConfig({ configPath })).toEqual({
			licenseServerUrl: "https://staging.example.com",
		});
	});

	it("loads a fresh development sidecar only for the main frame", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "qcut-license-dev-"));
		temporaryDirectories.push(directory);
		const configPath = path.join(
			directory,
			LICENSE_SERVER_BUILD_CONFIG_FILENAME
		);
		writeLicenseServerBuildConfig({
			buildConfig: createLicenseServerBuildConfig({
				configuredUrl: "http://127.0.0.1:8787",
			}),
			configPath,
		});
		const location = { configPath, refreshOnMainFrame: true };
		const initialConfig = loadInitialLicenseServerRuntimeConfig({ location });

		expect(initialConfig).toBeNull();
		expect(
			refreshLicenseServerRuntimeConfig({
				currentConfig: initialConfig,
				isMainFrame: false,
				location,
			})
		).toBeNull();
		expect(
			refreshLicenseServerRuntimeConfig({
				currentConfig: initialConfig,
				isMainFrame: true,
				location,
			})
		).toEqual({ licenseServerUrl: "http://127.0.0.1:8787" });
	});

	it.each([
		["missing", path.join(tmpdir(), "qcut-missing-license-config.json")],
		["invalid", null],
	] as const)("falls back to production for a %s artifact", (_description, suppliedConfigPath) => {
		const configPath =
			suppliedConfigPath ??
			createTemporaryConfigFile({ contents: '{"licenseServerUrl":false}' });

		expect(readLicenseServerBuildConfig({ configPath })).toEqual({
			licenseServerUrl: DEFAULT_LICENSE_SERVER_ORIGIN,
		});
	});

	it("resolves packaged and unpackaged build artifact paths", () => {
		expect(
			resolveLicenseServerBuildConfigPath({
				isPackaged: true,
				appPath: "/Applications/QCut.app/Contents/Resources/app.asar",
				moduleDir: "/ignored",
			})
		).toBe(
			path.join(
				"/Applications/QCut.app/Contents/Resources/app.asar",
				"apps/web/dist",
				LICENSE_SERVER_BUILD_CONFIG_FILENAME
			)
		);

		expect(
			resolveLicenseServerBuildConfigPath({
				isPackaged: false,
				appPath: "/ignored",
				moduleDir: "/repo/dist/electron",
			})
		).toBe(
			path.join(
				"/repo/dist/electron",
				"../../apps/web/dist",
				LICENSE_SERVER_BUILD_CONFIG_FILENAME
			)
		);
	});

	it("resolves the shared Vite development cache path", () => {
		const cacheDirectory = resolveLicenseServerDevelopmentCacheDirectory({
			webRoot: "/repo/apps/web",
		});

		expect(cacheDirectory).toBe(
			path.join("/repo/apps/web", "node_modules", ".vite")
		);
		expect(resolveLicenseServerDevelopmentConfigPath({ cacheDirectory })).toBe(
			path.join(
				"/repo/apps/web",
				"node_modules",
				".vite",
				LICENSE_SERVER_BUILD_CONFIG_FILENAME
			)
		);
	});

	it("uses the Vite sidecar only for an unpackaged development renderer", () => {
		expect(
			resolveLicenseServerRuntimeConfigLocation({
				appPath: "/ignored",
				isDevelopment: true,
				isPackaged: false,
				moduleDir: "/repo/dist/electron",
			})
		).toEqual({
			configPath: path.join(
				"/repo/dist/electron",
				"../../apps/web",
				"node_modules",
				".vite",
				LICENSE_SERVER_BUILD_CONFIG_FILENAME
			),
			refreshOnMainFrame: true,
		});
	});

	it("keeps packaged apps on the immutable build artifact", () => {
		const location = resolveLicenseServerRuntimeConfigLocation({
			appPath: "/Applications/QCut.app/Contents/Resources/app.asar",
			isDevelopment: true,
			isPackaged: true,
			moduleDir: "/ignored",
		});

		expect(location).toEqual({
			configPath: path.join(
				"/Applications/QCut.app/Contents/Resources/app.asar",
				"apps/web/dist",
				LICENSE_SERVER_BUILD_CONFIG_FILENAME
			),
			refreshOnMainFrame: false,
		});
		expect(loadInitialLicenseServerRuntimeConfig({ location })).toEqual({
			licenseServerUrl: DEFAULT_LICENSE_SERVER_ORIGIN,
		});
	});
});
