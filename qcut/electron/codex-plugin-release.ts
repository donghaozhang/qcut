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
export type FetchPluginReleasePage = ({
	page,
	perPage,
}: {
	page: number;
	perPage: number;
}) => Promise<GitHubRelease[]>;

const RELEASE_PAGE_SIZE = 100;

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

export async function fetchPluginReleasesUntilFound({
	fetchPage,
	page = 1,
	releases = [],
}: {
	fetchPage: FetchPluginReleasePage;
	page?: number;
	releases?: GitHubRelease[];
}): Promise<GitHubRelease[]> {
	const pageReleases = await fetchPage({
		page,
		perPage: RELEASE_PAGE_SIZE,
	});
	const collected = [...releases, ...pageReleases];
	if (
		selectLatestPluginRelease({ releases: collected }) ||
		pageReleases.length < RELEASE_PAGE_SIZE
	) {
		return collected;
	}
	return fetchPluginReleasesUntilFound({
		fetchPage,
		page: page + 1,
		releases: collected,
	});
}

export function fetchDefaultPluginReleases(): Promise<GitHubRelease[]> {
	return fetchPluginReleasesUntilFound({
		fetchPage: async ({ page, perPage }) => {
			const response = await fetch(
				`https://api.github.com/repos/Quriosity-agent/qcut/releases?per_page=${perPage}&page=${page}`,
				{
					headers: {
						Accept: "application/vnd.github+json",
						"User-Agent": "QCut-Plugin-Updater",
					},
					signal: AbortSignal.timeout(15_000),
				}
			);
			if (!response.ok) {
				throw new Error(
					`Plugin release check failed with HTTP ${response.status}`
				);
			}
			return (await response.json()) as GitHubRelease[];
		},
	});
}
