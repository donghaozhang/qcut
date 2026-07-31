import { describe, expect, it } from "vitest";
import {
	DEFAULT_LICENSE_SERVER_ORIGIN,
	resolveLicenseServerCspOrigins,
} from "../license-server-csp.js";

describe("license server CSP origins", () => {
	it("always includes the production license server", () => {
		expect(resolveLicenseServerCspOrigins({})).toEqual([
			DEFAULT_LICENSE_SERVER_ORIGIN,
		]);
	});

	it("adds only the parsed origin of an HTTPS URL", () => {
		expect(
			resolveLicenseServerCspOrigins({
				configuredUrl:
					"https://user:secret@staging.example.com:8443/api/stickers?token=secret#fragment",
			})
		).toEqual([
			DEFAULT_LICENSE_SERVER_ORIGIN,
			"https://staging.example.com:8443",
		]);
	});

	it.each([
		["http://localhost:3000/api/stickers", "http://localhost:3000"],
		["http://127.0.0.1:8787/path", "http://127.0.0.1:8787"],
	])("allows local HTTP URL %s", (configuredUrl, expectedOrigin) => {
		expect(resolveLicenseServerCspOrigins({ configuredUrl })).toEqual([
			DEFAULT_LICENSE_SERVER_ORIGIN,
			expectedOrigin,
		]);
	});

	it.each([
		"http://license.example.com",
		"http://localhost.example.com:3000",
		"http://127.0.0.1.example.com:3000",
		"http://[::1]:3000",
		"ws://localhost:3000",
		"javascript:alert(1)",
		"https://safe.example.com; connect-src *",
		"not a URL",
	])("rejects unsafe configured URL %s", (configuredUrl) => {
		expect(resolveLicenseServerCspOrigins({ configuredUrl })).toEqual([
			DEFAULT_LICENSE_SERVER_ORIGIN,
		]);
	});

	it("deduplicates the production origin", () => {
		expect(
			resolveLicenseServerCspOrigins({
				configuredUrl: `${DEFAULT_LICENSE_SERVER_ORIGIN}/api/stickers`,
			})
		).toEqual([DEFAULT_LICENSE_SERVER_ORIGIN]);
	});
});
