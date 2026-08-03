export const QCUT_RELEASE_API =
	"https://api.github.com/repos/Quriosity-agent/qcut/releases/latest";
export const QCUT_RELEASE_PAGE =
	"https://github.com/Quriosity-agent/qcut/releases/latest";

export function trustedReleaseUrl({ value }) {
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

export function trustedReleasePageUrl({ value }) {
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
			!asset.name.includes("/") &&
			!asset.name.includes("\\") &&
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
	preferArchive = false,
	preferDeb = false,
} = {}) {
	const available = downloadableAssets({ assets });
	if (platform === "darwin") {
		const dmg = (asset) =>
			asset.name.endsWith(".dmg") && asset.name.includes(`-${arch}`);
		const archive = (asset) =>
			asset.name.endsWith("-mac.zip") && asset.name.includes(`-${arch}-`);
		return firstMatchingAsset({
			assets: available,
			matchers: preferArchive ? [archive, dmg] : [dmg, archive],
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
		const releaseArch = arch === "x64" ? "x86_64" : arch;
		const appImage = (asset) =>
			asset.name.endsWith(".AppImage") &&
			asset.name.includes(`-${releaseArch}.`);
		const deb = (asset) => asset.name.endsWith("_amd64.deb") && arch === "x64";
		return firstMatchingAsset({
			assets: available,
			matchers: preferDeb ? [deb, appImage] : [appImage, deb],
		});
	}
	return null;
}

function versionFromAsset({ asset, tagName }) {
	const assetMatch = asset?.name?.match(/(\d{4}\.\d{1,2}\.\d{3,4})/);
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
	preferArchive = false,
	preferDeb = false,
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
			preferArchive,
			preferDeb,
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
						digest: asset.digest ?? null,
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
