import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createLicenseServerBuildConfig,
	resolveLicenseServerDevelopmentConfigPath,
} from "../../electron/license-server-build-config";
import { DEFAULT_LICENSE_SERVER_ORIGIN } from "../../electron/license-server-csp";
import {
	injectLicenseServerCspOrigins,
	LICENSE_SERVER_CSP_ANCHOR,
	persistLicenseServerDevelopmentConfig,
} from "./license-server-build-plugin";

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("license server build plugin", () => {
	it("injects production and the validated custom origin", () => {
		const html = `<meta content="connect-src 'self' ${LICENSE_SERVER_CSP_ANCHOR};">`;
		const buildConfig = createLicenseServerBuildConfig({
			configuredUrl: "https://staging.example.com:8443/api",
		});

		expect(injectLicenseServerCspOrigins({ html, buildConfig })).toBe(
			`<meta content="connect-src 'self' ${DEFAULT_LICENSE_SERVER_ORIGIN} https://staging.example.com:8443;">`
		);
	});

	it("injects the production origin once for the default config", () => {
		const html = `<meta content="${LICENSE_SERVER_CSP_ANCHOR}">`;
		const buildConfig = createLicenseServerBuildConfig({});

		expect(injectLicenseServerCspOrigins({ html, buildConfig })).toBe(
			`<meta content="${DEFAULT_LICENSE_SERVER_ORIGIN}">`
		);
	});

	it.each([
		["missing", "<meta>"],
		["duplicated", `${LICENSE_SERVER_CSP_ANCHOR} ${LICENSE_SERVER_CSP_ANCHOR}`],
	])("rejects a %s CSP anchor", (_description, html) => {
		const buildConfig = createLicenseServerBuildConfig({});

		expect(() =>
			injectLicenseServerCspOrigins({ html, buildConfig })
		).toThrowError(/Expected one license server CSP anchor/);
	});

	it("persists the same sanitized config before serving", () => {
		const cacheDirectory = mkdtempSync(
			path.join(tmpdir(), "qcut-vite-license-cache-")
		);
		temporaryDirectories.push(cacheDirectory);
		const buildConfig = createLicenseServerBuildConfig({
			configuredUrl:
				"https://user:secret@staging.example.com:8443/api?token=secret",
		});

		persistLicenseServerDevelopmentConfig({
			buildConfig,
			cacheDirectory,
			command: "serve",
		});

		const configPath = resolveLicenseServerDevelopmentConfigPath({
			cacheDirectory,
		});
		const serializedConfig = readFileSync(configPath, "utf8");
		expect(JSON.parse(serializedConfig)).toEqual({
			licenseServerUrl: "https://staging.example.com:8443",
		});
		expect(serializedConfig).not.toContain("secret");
		expect(serializedConfig).not.toContain("/api");
	});

	it("does not persist a development sidecar during production builds", () => {
		const cacheDirectory = mkdtempSync(
			path.join(tmpdir(), "qcut-vite-license-cache-")
		);
		temporaryDirectories.push(cacheDirectory);

		persistLicenseServerDevelopmentConfig({
			buildConfig: createLicenseServerBuildConfig({}),
			cacheDirectory,
			command: "build",
		});

		expect(
			existsSync(resolveLicenseServerDevelopmentConfigPath({ cacheDirectory }))
		).toBe(false);
	});
});
