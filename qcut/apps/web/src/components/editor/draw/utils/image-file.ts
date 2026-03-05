const DEFAULT_IMAGE_MIME_TYPE = "image/png";

const IMAGE_EXTENSIONS = new Set([
	"apng",
	"avif",
	"bmp",
	"gif",
	"heic",
	"heif",
	"ico",
	"jfif",
	"jpeg",
	"jpg",
	"png",
	"svg",
	"svgz",
	"tif",
	"tiff",
	"webp",
]);

const IMAGE_MIME_PREFIX = "image/";

interface FileLike {
	name?: string;
	type?: string;
}

interface NormalizeImageMimeTypeOptions {
	declaredType?: string | null;
	dataUrl?: string | null;
	filename?: string | null;
}

function getFileExtension(filename: string): string | null {
	try {
		const trimmed = filename.trim();
		if (!trimmed) return null;
		const parts = trimmed.split(".");
		if (parts.length < 2) return null;
		const ext = parts.pop()?.toLowerCase() ?? "";
		return ext || null;
	} catch {
		return null;
	}
}

export function extractMimeTypeFromDataUrl(dataUrl: string): string | null {
	try {
		if (!dataUrl.startsWith("data:")) return null;
		const commaIndex = dataUrl.indexOf(",");
		if (commaIndex === -1) return null;
		const semicolonIndex = dataUrl.indexOf(";");
		const endIndex =
			semicolonIndex !== -1 && semicolonIndex < commaIndex
				? semicolonIndex
				: commaIndex;
		const mimeType = dataUrl.slice(5, endIndex).trim().toLowerCase();
		if (!mimeType) return null;
		return mimeType;
	} catch {
		return null;
	}
}

export function isLikelyImageFile({ name, type }: FileLike): boolean {
	try {
		const normalizedType = (type ?? "").trim().toLowerCase();
		if (normalizedType.startsWith(IMAGE_MIME_PREFIX)) return true;

		const extension = getFileExtension(name ?? "");
		if (!extension) return false;
		return IMAGE_EXTENSIONS.has(extension);
	} catch {
		return false;
	}
}

export function normalizeImageMimeType({
	declaredType,
	dataUrl,
	filename,
}: NormalizeImageMimeTypeOptions): string {
	try {
		const normalizedDeclared = (declaredType ?? "").trim().toLowerCase();
		if (normalizedDeclared.startsWith(IMAGE_MIME_PREFIX)) {
			return normalizedDeclared;
		}

		const inferredFromDataUrl = dataUrl
			? extractMimeTypeFromDataUrl(dataUrl)
			: null;
		if (
			inferredFromDataUrl &&
			inferredFromDataUrl.startsWith(IMAGE_MIME_PREFIX)
		) {
			return inferredFromDataUrl;
		}

		const ext = getFileExtension(filename ?? "");
		if (!ext) return DEFAULT_IMAGE_MIME_TYPE;

		if (ext === "jpg" || ext === "jfif") return "image/jpeg";
		if (ext === "svg" || ext === "svgz") return "image/svg+xml";
		if (ext === "tif") return "image/tiff";
		if (IMAGE_EXTENSIONS.has(ext)) return `${IMAGE_MIME_PREFIX}${ext}`;
		return DEFAULT_IMAGE_MIME_TYPE;
	} catch {
		return DEFAULT_IMAGE_MIME_TYPE;
	}
}

export { DEFAULT_IMAGE_MIME_TYPE };
