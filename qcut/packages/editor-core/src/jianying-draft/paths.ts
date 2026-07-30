import type {
	JianyingDraftMediaType,
	JianyingDraftTargetPlatform,
} from "./types.js";

function getFileName({ filePath }: { filePath: string }): string {
	const normalizedPath = filePath.replaceAll("\\", "/");
	return normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
}

function sanitizeFileName({ fileName }: { fileName: string }): string {
	const sanitized = fileName
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
		.replace(/\s+/g, " ")
		.trim();
	return sanitized || "media";
}

function trimTrailingSeparators({ directory }: { directory: string }): string {
	return directory.replace(/[\\/]+$/g, "");
}

export function buildJianyingAssetPaths({
	materialId,
	mediaType,
	draftOutputDirectory,
	sourcePath,
	targetPlatform,
}: {
	materialId: string;
	mediaType: JianyingDraftMediaType;
	draftOutputDirectory: string;
	sourcePath: string;
	targetPlatform: JianyingDraftTargetPlatform;
}): {
	draftMediaPath: string;
	relativePath: string;
} {
	const folder =
		mediaType === "image" ? "image" : mediaType === "audio" ? "audio" : "video";
	const fileName = sanitizeFileName({
		fileName: getFileName({ filePath: sourcePath }),
	});
	const relativePath = `assets/${folder}/${materialId}-${fileName}`;
	const separator = targetPlatform === "windows" ? "\\" : "/";
	const platformRelativePath = relativePath.replaceAll("/", separator);
	const root = trimTrailingSeparators({ directory: draftOutputDirectory });

	return {
		draftMediaPath: `${root}${separator}${platformRelativePath}`,
		relativePath,
	};
}
