export interface GitHubRelease {
	tag_name?: string;
	draft?: boolean;
	prerelease?: boolean;
}

export interface PluginRelease {
	tag: string;
	version: string;
}

export type FetchPluginReleases = () => Promise<GitHubRelease[]>;

export function normalizePluginVersion({
	version,
}: {
	version?: string;
}): string {
	return version?.split("+", 1)[0] ?? "";
}

function parseVersionParts({ version }: { version: string }): number[] | null {
	const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
	if (!match) return null;
	return match.slice(1, 4).map(Number);
}

export function comparePluginVersions({
	left,
	right,
}: {
	left: string;
	right: string;
}): number {
	const leftParts = parseVersionParts({ version: left });
	const rightParts = parseVersionParts({ version: right });
	if (!leftParts || !rightParts) return left.localeCompare(right);
	for (let index = 0; index < leftParts.length; index += 1) {
		const difference = leftParts[index] - rightParts[index];
		if (difference !== 0) return difference;
	}
	return 0;
}

export function selectLatestPluginRelease({
	releases,
}: {
	releases: GitHubRelease[];
}): PluginRelease | undefined {
	const candidates: PluginRelease[] = [];
	for (const release of releases) {
		if (release.draft || release.prerelease) continue;
		const match = release.tag_name?.match(/^qcut-plugin-v(\d+\.\d+\.\d+)$/);
		if (!match) continue;
		candidates.push({ tag: release.tag_name ?? "", version: match[1] });
	}
	return candidates.sort((left, right) =>
		comparePluginVersions({ left: right.version, right: left.version })
	)[0];
}

export async function fetchDefaultPluginReleases(): Promise<GitHubRelease[]> {
	const response = await fetch(
		"https://api.github.com/repos/Quriosity-agent/qcut/releases?per_page=30",
		{
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": "QCut-Plugin-Updater",
			},
			signal: AbortSignal.timeout(15_000),
		}
	);
	if (!response.ok) {
		throw new Error(`Plugin release check failed with HTTP ${response.status}`);
	}
	return (await response.json()) as GitHubRelease[];
}
