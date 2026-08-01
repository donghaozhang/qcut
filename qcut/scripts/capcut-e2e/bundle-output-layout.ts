import { lstat, mkdtemp, rename, rm } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

export interface BundleOutputLayout {
	finalDirectory: string;
	stagingDirectory: string;
}

function getErrorCode({ error }: { error: unknown }): string | null {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return null;
	}
	return typeof error.code === "string" ? error.code : null;
}

async function assertFinalDirectoryIsAbsent({
	finalDirectory,
}: {
	finalDirectory: string;
}): Promise<void> {
	try {
		await lstat(finalDirectory);
	} catch (error: unknown) {
		if (getErrorCode({ error }) === "ENOENT") return;
		throw error;
	}
	throw new Error(
		`Bundle output already exists and will not be overwritten: ${finalDirectory}. Generate a new fixture run ID.`
	);
}

export async function createBundleOutputLayout({
	runDirectory,
}: {
	runDirectory: string;
}): Promise<BundleOutputLayout> {
	const finalDirectory = join(runDirectory, "bundles");
	await assertFinalDirectoryIsAbsent({ finalDirectory });
	const stagingDirectory = await mkdtemp(
		join(runDirectory, ".bundles-staging-")
	);
	return { finalDirectory, stagingDirectory };
}

export function relocateBundlePath({
	layout,
	path,
}: {
	layout: BundleOutputLayout;
	path: string;
}): string {
	const relativePath = relative(layout.stagingDirectory, path);
	if (
		relativePath.length === 0 ||
		relativePath === ".." ||
		relativePath.startsWith(`..${sep}`) ||
		isAbsolute(relativePath)
	) {
		throw new Error(`Bundle path is outside its staging directory: ${path}`);
	}
	return join(layout.finalDirectory, relativePath);
}

export async function publishBundleOutput({
	layout,
}: {
	layout: BundleOutputLayout;
}): Promise<void> {
	try {
		await rename(layout.stagingDirectory, layout.finalDirectory);
	} catch (error: unknown) {
		const errorCode = getErrorCode({ error });
		if (["EEXIST", "ENOTEMPTY", "EPERM"].includes(errorCode ?? "")) {
			throw new Error(
				`Bundle output appeared during generation and will not be overwritten: ${layout.finalDirectory}`
			);
		}
		throw error;
	}
}

export async function removeBundleStaging({
	layout,
}: {
	layout: BundleOutputLayout;
}): Promise<void> {
	await rm(layout.stagingDirectory, { force: true, recursive: true });
}
