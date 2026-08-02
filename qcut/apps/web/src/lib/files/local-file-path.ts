export const ABSOLUTE_LOCAL_PATH_PATTERN = /^(?:\/|[a-zA-Z]:[\\/]|\\\\)/;

export function hasDotPathSegment({ filePath }: { filePath: string }): boolean {
	return filePath
		.split(/[\\/]/)
		.some((segment) => segment === "." || segment === "..");
}
