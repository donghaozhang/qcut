const BASE64_CHUNK_BYTES = 32 * 1024;

export function encodeBytesAsBase64({ bytes }: { bytes: Uint8Array }): string {
	const chunks: string[] = [];
	for (
		let offset = 0;
		offset < bytes.byteLength;
		offset += BASE64_CHUNK_BYTES
	) {
		const end = Math.min(offset + BASE64_CHUNK_BYTES, bytes.byteLength);
		let binary = "";
		for (let index = offset; index < end; index += 1) {
			binary += String.fromCharCode(bytes[index] ?? 0);
		}
		chunks.push(binary);
	}
	return btoa(chunks.join(""));
}
