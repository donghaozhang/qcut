export function createPngObjectUrl({
	pngData,
}: {
	pngData: Uint8Array;
}): string {
	const pngBuffer = new ArrayBuffer(pngData.byteLength);
	new Uint8Array(pngBuffer).set(pngData);
	return URL.createObjectURL(new Blob([pngBuffer], { type: "image/png" }));
}

export function revokeObjectUrlAfterCommit({ url }: { url?: string }): void {
	if (!url) return;
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
