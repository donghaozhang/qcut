import { existsSync } from "node:fs";
import { join } from "node:path";

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export interface JianyingFilterPackageIdentity {
	container: "artistEffect" | "effect";
	packageIdentifier: string;
	version: string;
}

function assertSafePackageIdentity({
	identity,
}: {
	identity: JianyingFilterPackageIdentity;
}) {
	if (
		!SAFE_SEGMENT.test(identity.packageIdentifier) ||
		!SAFE_SEGMENT.test(identity.version)
	) {
		throw new Error("Invalid local filter package identity");
	}
}

export function selectJianyingFilterCacheRoot({
	cacheRoots,
	identity,
}: {
	cacheRoots: string[];
	identity: JianyingFilterPackageIdentity;
}): string {
	assertSafePackageIdentity({ identity });
	if (cacheRoots.length === 0) {
		throw new Error("No local filter package roots are configured");
	}
	return (
		cacheRoots.find((cacheRoot) =>
			existsSync(
				join(
					cacheRoot,
					identity.container,
					identity.packageIdentifier,
					identity.version
				)
			)
		) ?? cacheRoots[0]
	);
}
