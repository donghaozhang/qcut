export function dataUrlToBlob({ dataUrl }: { dataUrl: string }): Blob {
	if (!dataUrl.startsWith("data:")) {
		throw new Error("Expected a data URL");
	}

	const separatorIndex = dataUrl.indexOf(",");
	if (separatorIndex < 0) {
		throw new Error("Invalid data URL");
	}

	const metadata = dataUrl.slice(5, separatorIndex);
	const [mimeType = "", ...parameters] = metadata.split(";");
	const payload = dataUrl.slice(separatorIndex + 1);
	const isBase64 = parameters.some(
		(parameter) => parameter.toLowerCase() === "base64"
	);

	try {
		const bytes = isBase64
			? Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
			: new TextEncoder().encode(decodeURIComponent(payload));
		return new Blob([bytes], { type: mimeType || "text/plain" });
	} catch {
		throw new Error("Invalid data URL payload");
	}
}
