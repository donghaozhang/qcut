import * as fs from "node:fs";
import * as path from "node:path";
import {
	DEFAULT_LICENSE_SERVER_ORIGIN,
	resolveAllowedLicenseServerOrigin,
} from "./license-server-csp.js";

export const LICENSE_SERVER_BUILD_CONFIG_FILENAME =
	"license-server-config.json";
const VITE_CACHE_DIRECTORY_SEGMENTS = ["node_modules", ".vite"] as const;

export interface LicenseServerBuildConfig {
	licenseServerUrl: string;
}

export interface LicenseServerRuntimeConfigLocation {
	configPath: string;
	refreshOnMainFrame: boolean;
}

export function createLicenseServerBuildConfig({
	configuredUrl,
}: {
	configuredUrl?: string;
}): LicenseServerBuildConfig {
	const trimmedUrl = configuredUrl?.trim();
	if (!trimmedUrl) {
		return { licenseServerUrl: DEFAULT_LICENSE_SERVER_ORIGIN };
	}

	const configuredOrigin = resolveAllowedLicenseServerOrigin({
		configuredUrl: trimmedUrl,
	});
	if (!configuredOrigin) {
		throw new Error(
			"VITE_LICENSE_SERVER_URL must use HTTPS or local HTTP on localhost/127.0.0.1"
		);
	}

	return { licenseServerUrl: configuredOrigin };
}

export function serializeLicenseServerBuildConfig({
	buildConfig,
}: {
	buildConfig: LicenseServerBuildConfig;
}): string {
	return `${JSON.stringify(buildConfig)}\n`;
}

export function parseLicenseServerBuildConfig({
	serializedConfig,
}: {
	serializedConfig: string;
}): LicenseServerBuildConfig | null {
	try {
		const parsedConfig = JSON.parse(serializedConfig) as unknown;
		if (
			typeof parsedConfig !== "object" ||
			parsedConfig === null ||
			Array.isArray(parsedConfig)
		) {
			return null;
		}

		const licenseServerUrl = (parsedConfig as Record<string, unknown>)
			.licenseServerUrl;
		if (typeof licenseServerUrl !== "string") {
			return null;
		}

		const licenseServerOrigin = resolveAllowedLicenseServerOrigin({
			configuredUrl: licenseServerUrl,
		});
		if (licenseServerOrigin !== licenseServerUrl) {
			return null;
		}

		return { licenseServerUrl };
	} catch {
		return null;
	}
}

export function resolveLicenseServerBuildConfigPath({
	isPackaged,
	appPath,
	moduleDir,
}: {
	isPackaged: boolean;
	appPath: string;
	moduleDir: string;
}): string {
	const rendererDistPath = isPackaged
		? path.join(appPath, "apps/web/dist")
		: path.join(moduleDir, "../../apps/web/dist");

	return path.join(rendererDistPath, LICENSE_SERVER_BUILD_CONFIG_FILENAME);
}

export function resolveLicenseServerDevelopmentCacheDirectory({
	webRoot,
}: {
	webRoot: string;
}): string {
	return path.join(webRoot, ...VITE_CACHE_DIRECTORY_SEGMENTS);
}

export function resolveLicenseServerDevelopmentConfigPath({
	cacheDirectory,
}: {
	cacheDirectory: string;
}): string {
	return path.join(cacheDirectory, LICENSE_SERVER_BUILD_CONFIG_FILENAME);
}

export function resolveLicenseServerRuntimeConfigLocation({
	appPath,
	isDevelopment,
	isPackaged,
	moduleDir,
}: {
	appPath: string;
	isDevelopment: boolean;
	isPackaged: boolean;
	moduleDir: string;
}): LicenseServerRuntimeConfigLocation {
	if (isDevelopment && !isPackaged) {
		const webRoot = path.join(moduleDir, "../../apps/web");
		const cacheDirectory = resolveLicenseServerDevelopmentCacheDirectory({
			webRoot,
		});
		return {
			configPath: resolveLicenseServerDevelopmentConfigPath({
				cacheDirectory,
			}),
			refreshOnMainFrame: true,
		};
	}

	return {
		configPath: resolveLicenseServerBuildConfigPath({
			appPath,
			isPackaged,
			moduleDir,
		}),
		refreshOnMainFrame: false,
	};
}

export function writeLicenseServerBuildConfig({
	buildConfig,
	configPath,
}: {
	buildConfig: LicenseServerBuildConfig;
	configPath: string;
}): void {
	fs.mkdirSync(path.dirname(configPath), { recursive: true });
	fs.writeFileSync(
		configPath,
		serializeLicenseServerBuildConfig({ buildConfig }),
		"utf8"
	);
}

export function loadInitialLicenseServerRuntimeConfig({
	location,
}: {
	location: LicenseServerRuntimeConfigLocation;
}): LicenseServerBuildConfig | null {
	return location.refreshOnMainFrame
		? null
		: readLicenseServerBuildConfig({ configPath: location.configPath });
}

export function refreshLicenseServerRuntimeConfig({
	currentConfig,
	isMainFrame,
	location,
}: {
	currentConfig: LicenseServerBuildConfig | null;
	isMainFrame: boolean;
	location: LicenseServerRuntimeConfigLocation;
}): LicenseServerBuildConfig | null {
	if (!location.refreshOnMainFrame || !isMainFrame) return currentConfig;
	return readLicenseServerBuildConfig({ configPath: location.configPath });
}

export function readLicenseServerBuildConfig({
	configPath,
}: {
	configPath: string;
}): LicenseServerBuildConfig {
	try {
		const serializedConfig = fs.readFileSync(configPath, "utf8");
		return (
			parseLicenseServerBuildConfig({ serializedConfig }) ??
			createLicenseServerBuildConfig({})
		);
	} catch {
		return createLicenseServerBuildConfig({});
	}
}
