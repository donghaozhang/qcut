import { describe, expect, it } from "vitest";
import { createLicenseServerBuildConfig } from "../../electron/license-server-build-config";
import { DEFAULT_LICENSE_SERVER_ORIGIN } from "../../electron/license-server-csp";
import {
	injectLicenseServerCspOrigins,
	LICENSE_SERVER_CSP_ANCHOR,
} from "./license-server-build-plugin";

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
});
