import type { Plugin } from "vite";
import {
	LICENSE_SERVER_BUILD_CONFIG_FILENAME,
	type LicenseServerBuildConfig,
	serializeLicenseServerBuildConfig,
} from "../../electron/license-server-build-config";
import {
	DEFAULT_LICENSE_SERVER_ORIGIN,
	resolveLicenseServerCspOrigins,
} from "../../electron/license-server-csp";

export const LICENSE_SERVER_CSP_ANCHOR = DEFAULT_LICENSE_SERVER_ORIGIN;

export function injectLicenseServerCspOrigins({
	html,
	buildConfig,
}: {
	html: string;
	buildConfig: LicenseServerBuildConfig;
}): string {
	const anchorCount = html.split(LICENSE_SERVER_CSP_ANCHOR).length - 1;
	if (anchorCount !== 1) {
		throw new Error(
			`Expected one license server CSP anchor, found ${anchorCount}`
		);
	}

	const connectSrcOrigins = resolveLicenseServerCspOrigins({
		configuredUrl: buildConfig.licenseServerUrl,
	}).join(" ");

	return html.replace(LICENSE_SERVER_CSP_ANCHOR, connectSrcOrigins);
}

export function createLicenseServerBuildPlugin({
	buildConfig,
}: {
	buildConfig: LicenseServerBuildConfig;
}): Plugin {
	return {
		name: "qcut-license-server-build-config",
		transformIndexHtml(html) {
			return injectLicenseServerCspOrigins({ html, buildConfig });
		},
		generateBundle() {
			this.emitFile({
				type: "asset",
				fileName: LICENSE_SERVER_BUILD_CONFIG_FILENAME,
				source: serializeLicenseServerBuildConfig({ buildConfig }),
			});
		},
	};
}
