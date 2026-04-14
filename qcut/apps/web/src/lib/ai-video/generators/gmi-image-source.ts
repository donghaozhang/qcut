/**
 * GMI image source resolver.
 *
 * GMI Cloud's video generation endpoints accept image inputs as either a
 * publicly accessible HTTPS URL or a `data:` URI. They do NOT (today)
 * expose a media upload API — only an artifact-scoped resumable upload
 * for ML model checkpoints (see GMI Python SDK `_file_upload_client.py`,
 * `_artifact_client.get_bigfile_upload_url`).
 *
 * This module hides that gap from the GMI handlers: it tries the FAL
 * CDN uploader first (returns a real https URL — preferred for large
 * files and for offloading bandwidth from the renderer), and falls
 * back to a base64 `data:` URI when the FAL key isn't configured or
 * the upload fails.
 *
 * Size guard: refuse to inline files above `MAX_INLINE_BYTES`, since
 * very large data URIs blow up the GMI request body (and base64 adds
 * ~33% overhead). 10 MB matches GMI's documented limit for direct
 * image inputs on the kling-v3-omni / Seedance models.
 */

/** Hard cap on raw bytes we'll inline as a data URI. */
export const MAX_INLINE_BYTES = 10 * 1024 * 1024;

/** Read a `File` into a `data:<mime>;base64,...` string. */
export async function fileToDataUri(file: File): Promise<string> {
	if (file.size > MAX_INLINE_BYTES) {
		throw new Error(
			`Image is ${(file.size / 1024 / 1024).toFixed(1)}MB; GMI inline upload limit is ${MAX_INLINE_BYTES / 1024 / 1024}MB. Configure VITE_FAL_API_KEY to upload via FAL CDN instead.`
		);
	}

	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result === "string") {
				resolve(result);
			} else {
				reject(new Error("FileReader returned a non-string result"));
			}
		};
		reader.onerror = () =>
			reject(reader.error ?? new Error("FileReader failed"));
		reader.readAsDataURL(file);
	});
}

/**
 * Resolve a `File` to a string the GMI API accepts (URL or data URI).
 *
 * Prefers `uploader` (FAL CDN) so the GMI request stays small. Falls
 * back to inlining the file as a `data:` URI when the uploader rejects
 * — typically because the FAL key isn't configured. Surfaces the
 * uploader's error on the console so a misconfigured key is debuggable
 * without the user losing the generation.
 */
export async function resolveGmiImageSource(
	file: File,
	uploader: (file: File) => Promise<string>
): Promise<string> {
	try {
		return await uploader(file);
	} catch (uploadErr) {
		const reason =
			uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
		console.warn(
			`[gmi-image-source] FAL upload failed (${reason}); falling back to inline data URI.`
		);
		return fileToDataUri(file);
	}
}
