import type { BigIntStats } from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export function isSameOrDescendantPath({
	candidatePath,
	parentPath,
}: {
	candidatePath: string;
	parentPath: string;
}): boolean {
	const relativePath = relative(parentPath, candidatePath);
	return (
		relativePath === "" ||
		(relativePath !== ".." &&
			!relativePath.startsWith(`..${sep}`) &&
			!isAbsolute(relativePath))
	);
}

export async function requireCanonicalPath({
	expectedKind,
	label,
	path,
}: {
	expectedKind: "directory" | "file";
	label: string;
	path: string;
}): Promise<{ canonicalPath: string; stats: BigIntStats }> {
	if (!isAbsolute(path)) {
		throw new Error(`${label} must be an absolute path.`);
	}
	const requestedPath = resolve(path);
	const stats = await lstat(requestedPath, { bigint: true });
	if (stats.isSymbolicLink()) {
		throw new Error(`${label} must not be a symbolic link.`);
	}
	if (expectedKind === "directory" && !stats.isDirectory()) {
		throw new Error(`${label} must be a directory.`);
	}
	if (expectedKind === "file" && !stats.isFile()) {
		throw new Error(`${label} must be a regular file.`);
	}
	const canonicalPath = await realpath(requestedPath);
	if (canonicalPath !== requestedPath) {
		throw new Error(`${label} must not traverse symbolic links.`);
	}
	return { canonicalPath, stats };
}

export function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

export function requireNonEmptyString({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${label} must be a non-empty string.`);
	}
	return value;
}

export function assertExactKeys({
	expectedKeys,
	label,
	value,
}: {
	expectedKeys: readonly string[];
	label: string;
	value: Record<string, unknown>;
}): void {
	const actualKeys = Object.keys(value).sort();
	const sortedExpectedKeys = [...expectedKeys].sort();
	if (
		actualKeys.length !== sortedExpectedKeys.length ||
		actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
	) {
		throw new Error(`${label} contains unexpected or missing fields.`);
	}
}
