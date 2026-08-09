import { createHash, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { createWriteStream, mkdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname } from "node:path";

export const QCUT_RELEASE_API =
	"https://api.github.com/repos/Quriosity-agent/qcut/releases/latest";
export const QCUT_RELEASE_PAGE =
	"https://github.com/Quriosity-agent/qcut/releases/latest";

export type QCutInstallationKind =
	| "mac-zip"
	| "windows-nsis"
	| "linux-appimage"
	| "linux-deb";

export interface QCutReleaseAsset {
	name: string;
	url: string;
	size: number;
	digest: string;
}

export interface QCutReleaseInfo {
	tagName: string;
	version: string;
	publishedAt?: string;
	pageUrl: string;
	asset: QCutReleaseAsset;
}

interface GitHubReleaseAsset {
	name?: unknown;
	browser_download_url?: unknown;
	size?: unknown;
	digest?: unknown;
}

interface GitHubRelease {
	tag_name?: unknown;
	published_at?: unknown;
	html_url?: unknown;
	assets?: unknown;
}

function isTrustedReleaseUrl({ value }: { value: string }): boolean {
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

function isTrustedReleasePage({ value }: { value: string }): boolean {
	try {
		const url = new URL(value);
		return (
			url.protocol === "https:" &&
			url.hostname === "github.com" &&
			url.pathname.startsWith("/Quriosity-agent/qcut/releases/tag/")
		);
	} catch {
		return false;
	}
}

function assetMatches({
	name,
	kind,
	arch,
}: {
	name: string;
	kind: QCutInstallationKind;
	arch: string;
}): boolean {
	if (kind === "mac-zip") {
		return name.endsWith("-mac.zip") && name.includes(`-${arch}-`);
	}
	if (kind === "windows-nsis") {
		return name.includes("-Setup-") && name.endsWith(".exe");
	}
	if (kind === "linux-appimage") {
		const releaseArch = arch === "x64" ? "x86_64" : arch;
		return name.endsWith(".AppImage") && name.includes(`-${releaseArch}.`);
	}
	return name.endsWith("_amd64.deb") && arch === "x64";
}

function normalizeAsset({ asset }: { asset: GitHubReleaseAsset }) {
	if (
		typeof asset.name !== "string" ||
		typeof asset.browser_download_url !== "string" ||
		typeof asset.size !== "number" ||
		!Number.isFinite(asset.size) ||
		asset.size <= 0 ||
		typeof asset.digest !== "string" ||
		!/^sha256:[a-f0-9]{64}$/i.test(asset.digest) ||
		basename(asset.name) !== asset.name ||
		!isTrustedReleaseUrl({ value: asset.browser_download_url })
	) {
		return undefined;
	}
	return {
		name: asset.name,
		url: asset.browser_download_url,
		size: asset.size,
		digest: asset.digest.toLowerCase(),
	} satisfies QCutReleaseAsset;
}

export function selectQCutReleaseAsset({
	assets,
	kind,
	arch,
}: {
	assets: GitHubReleaseAsset[];
	kind: QCutInstallationKind;
	arch: string;
}): QCutReleaseAsset | undefined {
	for (const candidate of assets) {
		const asset = normalizeAsset({ asset: candidate });
		if (asset && assetMatches({ name: asset.name, kind, arch })) return asset;
	}
	return undefined;
}

function versionFromAsset({ name }: { name: string }): string {
	const match = name.match(/(\d{4}\.\d{1,2}\.\d{3,4})/);
	if (!match) throw new Error(`Cannot determine QCut version from ${name}`);
	return match[1];
}

export function compareQCutPackageVersions({
	current,
	latest,
}: {
	current: string;
	latest: string;
}): number {
	const currentBase = current.split("-")[0];
	const latestBase = latest.split("-")[0];
	const currentParts = currentBase.split(".").map(Number);
	const latestParts = latestBase.split(".").map(Number);
	const length = Math.max(currentParts.length, latestParts.length);
	for (let index = 0; index < length; index += 1) {
		const difference = (currentParts[index] ?? 0) - (latestParts[index] ?? 0);
		if (difference !== 0) return Math.sign(difference);
	}
	if (current.includes("-") && !latest.includes("-")) return -1;
	if (!current.includes("-") && latest.includes("-")) return 1;
	return 0;
}

export async function fetchLatestQCutRelease({
	kind,
	arch = process.arch,
	fetchImpl = globalThis.fetch,
	signal,
	timeoutMs = 15_000,
}: {
	kind: QCutInstallationKind;
	arch?: string;
	fetchImpl?: typeof fetch;
	signal?: AbortSignal;
	timeoutMs?: number;
}): Promise<QCutReleaseInfo> {
	const timeoutSignal = AbortSignal.timeout(timeoutMs);
	const requestSignal = signal
		? AbortSignal.any([signal, timeoutSignal])
		: timeoutSignal;
	const response = await fetchImpl(QCUT_RELEASE_API, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "qcut-cli-updater",
		},
		signal: requestSignal,
	});
	if (!response.ok) {
		throw new Error(`GitHub release check failed with HTTP ${response.status}`);
	}

	const release = (await response.json()) as GitHubRelease;
	const assets = Array.isArray(release.assets)
		? (release.assets as GitHubReleaseAsset[])
		: [];
	const asset = selectQCutReleaseAsset({ assets, kind, arch });
	if (!asset) {
		throw new Error(
			`The latest QCut release has no ${kind} package for ${arch}`
		);
	}
	if (typeof release.tag_name !== "string") {
		throw new Error("The latest QCut release is missing its tag");
	}

	return {
		tagName: release.tag_name,
		version: versionFromAsset({ name: asset.name }),
		publishedAt:
			typeof release.published_at === "string"
				? release.published_at
				: undefined,
		pageUrl:
			typeof release.html_url === "string" &&
			isTrustedReleasePage({ value: release.html_url })
				? release.html_url
				: QCUT_RELEASE_PAGE,
		asset,
	};
}

function digestMatches({
	actual,
	expected,
}: {
	actual: string;
	expected: string;
}) {
	const actualBytes = Buffer.from(actual, "hex");
	const expectedBytes = Buffer.from(expected, "hex");
	return (
		actualBytes.length === expectedBytes.length &&
		timingSafeEqual(actualBytes, expectedBytes)
	);
}

export async function downloadQCutReleaseAsset({
	asset,
	destinationPath,
	fetchImpl = globalThis.fetch,
	signal,
	onProgress = () => {},
}: {
	asset: QCutReleaseAsset;
	destinationPath: string;
	fetchImpl?: typeof fetch;
	signal?: AbortSignal;
	onProgress?: ({
		transferred,
		total,
	}: {
		transferred: number;
		total: number;
	}) => void;
}): Promise<void> {
	const response = await fetchImpl(asset.url, { signal });
	if (!response.ok || !response.body) {
		throw new Error(`QCut download failed with HTTP ${response.status}`);
	}

	mkdirSync(dirname(destinationPath), { recursive: true });
	const temporaryPath = `${destinationPath}.partial-${process.pid}`;
	const output = createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 });
	const reader = response.body.getReader();
	const hash = createHash("sha256");
	let transferred = 0;
	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) break;
			transferred += chunk.value.byteLength;
			if (transferred > asset.size) {
				throw new Error("QCut download exceeded the expected package size");
			}
			hash.update(chunk.value);
			if (!output.write(chunk.value)) await once(output, "drain");
			onProgress({ transferred, total: asset.size });
		}
		output.end();
		await once(output, "finish");

		if (transferred !== asset.size) {
			throw new Error(
				`QCut download size mismatch: expected ${asset.size}, received ${transferred}`
			);
		}
		const actualDigest = hash.digest("hex");
		const expectedDigest = asset.digest.slice("sha256:".length);
		if (!digestMatches({ actual: actualDigest, expected: expectedDigest })) {
			throw new Error("QCut download failed SHA-256 verification");
		}
		renameSync(temporaryPath, destinationPath);
	} catch (error: unknown) {
		output.destroy();
		rmSync(temporaryPath, { force: true });
		throw error;
	} finally {
		reader.releaseLock();
	}
}
