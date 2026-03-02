import {
	handleError,
	ErrorCategory,
	ErrorSeverity,
} from "@/lib/debug/error-handler";

/**
 * Convert a data URL to a File object for media import
 */
export const dataUrlToFile = async (
	dataUrl: string,
	filename: string
): Promise<File> => {
	try {
		const res = await fetch(dataUrl);
		const blob = await res.blob();
		return new File([blob], filename, { type: blob.type });
	} catch (error) {
		handleError(error, {
			operation: "canvas data URL to file conversion",
			category: ErrorCategory.STORAGE,
			severity: ErrorSeverity.MEDIUM,
		});
		throw error;
	}
};

/**
 * Download a drawing as an image file
 */
export const downloadDrawing = (dataUrl: string, filename: string): void => {
	try {
		const link = document.createElement("a");
		link.href = dataUrl;
		link.download = filename;
		link.style.display = "none";
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		if (dataUrl.startsWith("blob:")) {
			URL.revokeObjectURL(dataUrl);
		}
	} catch (error) {
		handleError(error, {
			operation: "drawing download",
			category: ErrorCategory.STORAGE,
			severity: ErrorSeverity.MEDIUM,
		});
		throw error;
	}
};
