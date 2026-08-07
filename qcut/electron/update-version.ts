export interface ReleaseVersionParts {
	year: number;
	month: number;
	day: number;
	build: number;
	prerelease: { channel: string; number: number } | null;
}

const RELEASE_VERSION_PATTERN =
	/^(\d{4})\.(\d{2})\.(\d{2})\.(\d+)(?:-([a-z]+)\.(\d+))?$/;
const PACKAGE_VERSION_PATTERN =
	/^(\d{4})\.(\d{1,2})\.(\d+)(?:-([a-z]+)\.(\d+))?$/;
const LEGACY_SEMVER_PATTERN =
	/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*)?(?:\+[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*)?$/;
const BUILDS_PER_DAY = 100;

function assertCalendarParts({
	year,
	month,
	day,
	build,
}: Omit<ReleaseVersionParts, "prerelease">): void {
	if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) {
		throw new Error("Release version contains an invalid calendar date");
	}

	if (build < 1 || build >= BUILDS_PER_DAY) {
		throw new Error("Release build number must be between 1 and 99");
	}
}

export function parseReleaseVersion({
	version,
}: {
	version: string;
}): ReleaseVersionParts {
	const match = RELEASE_VERSION_PATTERN.exec(version);
	if (!match) {
		throw new Error(`Invalid QCut release version: ${version}`);
	}

	const parsed: ReleaseVersionParts = {
		year: Number.parseInt(match[1], 10),
		month: Number.parseInt(match[2], 10),
		day: Number.parseInt(match[3], 10),
		build: Number.parseInt(match[4], 10),
		prerelease: match[5]
			? { channel: match[5], number: Number.parseInt(match[6], 10) }
			: null,
	};

	assertCalendarParts(parsed);
	return parsed;
}

export function toPackageVersion({
	releaseVersion,
}: {
	releaseVersion: string;
}): string {
	const parsed = parseReleaseVersion({ version: releaseVersion });
	const patch = parsed.day * BUILDS_PER_DAY + parsed.build;
	const suffix = parsed.prerelease
		? `-${parsed.prerelease.channel}.${parsed.prerelease.number}`
		: "";
	return `${parsed.year}.${parsed.month}.${patch}${suffix}`;
}

export function toReleaseVersion({
	packageVersion,
}: {
	packageVersion: string;
}): string {
	const match = PACKAGE_VERSION_PATTERN.exec(packageVersion);
	if (!match) return packageVersion;

	const year = Number.parseInt(match[1], 10);
	const month = Number.parseInt(match[2], 10);
	const patch = Number.parseInt(match[3], 10);
	const day = Math.floor(patch / BUILDS_PER_DAY);
	const build = patch % BUILDS_PER_DAY;

	try {
		assertCalendarParts({ year, month, day, build });
	} catch {
		return packageVersion;
	}

	const mm = String(month).padStart(2, "0");
	const dd = String(day).padStart(2, "0");
	const suffix = match[4] ? `-${match[4]}.${match[5]}` : "";
	return `${year}.${mm}.${dd}.${build}${suffix}`;
}

export function normalizeReleaseNotesVersion({
	version,
}: {
	version: string;
}): string {
	const releaseVersion = toReleaseVersion({ packageVersion: version });

	try {
		parseReleaseVersion({ version: releaseVersion });
		return releaseVersion;
	} catch {
		if (LEGACY_SEMVER_PATTERN.test(releaseVersion)) return releaseVersion;
		throw new Error("Invalid version format");
	}
}

const PRERELEASE_CHANNEL_ORDER: Record<string, number> = {
	alpha: 0,
	beta: 1,
	rc: 2,
};

/**
 * Compares two QCut versions (package or release form). Returns a negative
 * number when `left` is older, positive when newer, and 0 when equal.
 * Throws when either version cannot be parsed as a QCut release version.
 */
export function compareReleaseVersions({
	left,
	right,
}: {
	left: string;
	right: string;
}): number {
	const a = parseReleaseVersion({
		version: toReleaseVersion({ packageVersion: left }),
	});
	const b = parseReleaseVersion({
		version: toReleaseVersion({ packageVersion: right }),
	});

	const calendar =
		a.year - b.year || a.month - b.month || a.day - b.day || a.build - b.build;
	if (calendar !== 0) return calendar;

	// A stable build is newer than any prerelease of the same build.
	if (a.prerelease === null && b.prerelease === null) return 0;
	if (a.prerelease === null) return 1;
	if (b.prerelease === null) return -1;

	const channelDelta =
		(PRERELEASE_CHANNEL_ORDER[a.prerelease.channel] ?? -1) -
		(PRERELEASE_CHANNEL_ORDER[b.prerelease.channel] ?? -1);
	if (channelDelta !== 0) return channelDelta;
	return a.prerelease.number - b.prerelease.number;
}

export function detectUpdateChannel({
	version,
}: {
	version: string;
}): "latest" | "alpha" | "beta" | "rc" {
	if (version.includes("-alpha.")) return "alpha";
	if (version.includes("-beta.")) return "beta";
	if (version.includes("-rc.")) return "rc";
	return "latest";
}
