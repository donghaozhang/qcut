/**
 * Platform-aware file output for exported video blobs.
 *
 * - iPad (Capacitor): Saves to device filesystem, optionally shares to Photos
 * - Desktop (Electron): Existing flow handles this via FFmpeg CLI output
 * - Web fallback: Browser download via <a> element
 */

/** Result of a save operation */
export interface SaveResult {
	success: boolean;
	filePath?: string;
	error?: string;
}

/**
 * Save an exported video blob to the appropriate platform destination.
 *
 * @param blob - The video MP4/WebM blob
 * @param filename - Desired filename (e.g. "export-2026-03-11.mp4")
 */
export async function saveExportedVideo(
	blob: Blob,
	filename: string
): Promise<SaveResult> {
	// On iPad, navigator.share is the most memory-efficient way (avoids base64 conversion)
	const file = new File([blob], filename, { type: blob.type });
	if (
		typeof navigator.share === "function" &&
		navigator.canShare?.({ files: [file] })
	) {
		try {
			await navigator.share({ files: [file], title: filename });
			return { success: true };
		} catch {
			// Share was cancelled or failed, proceed to other methods
		}
	}

	// Try Capacitor filesystem (iPad)
	if (isCapacitorAvailable()) {
		return saveViaCapacitor(blob, filename);
	}

	// Browser fallback: download via <a> tag
	return saveViaBrowserDownload(blob, filename);
}

/**
 * Share an exported video (iPad: opens share sheet for "Save to Photos").
 */
export async function shareExportedVideo(
	filePath: string
): Promise<SaveResult> {
	if (!isCapacitorAvailable()) {
		return { success: false, error: "Share not available in browser" };
	}

	try {
		// Dynamic module path avoids Vite static analysis (package may not be installed)
		const shareModule = "@capacitor/" + "share";
		const { Share } = await import(/* @vite-ignore */ shareModule);
		await Share.share({
			title: "QCut Export",
			url: filePath,
		});
		return { success: true, filePath };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/** Check if Capacitor native APIs are available (iPad/iOS) */
function isCapacitorAvailable(): boolean {
	return (
		typeof window !== "undefined" &&
		"Capacitor" in window &&
		(window as any).Capacitor?.isNativePlatform?.() === true
	);
}

/** Save blob via Capacitor Filesystem plugin */
async function saveViaCapacitor(
	blob: Blob,
	filename: string
): Promise<SaveResult> {
	try {
		// Dynamic module path avoids Vite static analysis (package may not be installed)
		const fsModule = "@capacitor/" + "filesystem";
		const { Filesystem, Directory } = await import(/* @vite-ignore */ fsModule);

		// Convert blob to base64 for Capacitor
		const base64 = await blobToBase64(blob);

		const result = await Filesystem.writeFile({
			path: `QCut/${filename.split("/").pop()?.split("\\").pop() || "export.mp4"}`,
			data: base64,
			directory: Directory.Documents,
			recursive: true,
		});

		return { success: true, filePath: result.uri };
	} catch (err) {
		console.error("[export-output] Capacitor save failed:", err);
		// Fallback to browser download
		return saveViaBrowserDownload(blob, filename);
	}
}

/** Save blob via browser download */
function saveViaBrowserDownload(blob: Blob, filename: string): SaveResult {
	try {
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.style.display = "none";
		document.body.appendChild(a);
		a.click();

		// Cleanup
		setTimeout(() => {
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		}, 100);

		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/** Convert Blob to base64 data string */
function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			// Strip data URL prefix (data:video/mp4;base64,)
			const base64 = result.split(",")[1];
			resolve(base64);
		};
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}
