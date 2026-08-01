import { MAX_PRIVATE_STICKER_MANIFEST_BYTES } from "@qcut/editor-core/sticker-lab";

const REMOTE_MANIFEST_SIZE_ERROR = `Sticker lab manifest exceeds ${MAX_PRIVATE_STICKER_MANIFEST_BYTES} bytes`;

function readChunks({
	reader,
}: {
	reader: ReadableStreamDefaultReader<Uint8Array>;
}): Promise<Uint8Array> {
	const bytes = new Uint8Array(MAX_PRIVATE_STICKER_MANIFEST_BYTES);
	let loadedBytes = 0;

	return new Promise((resolve, reject) => {
		const readNext = () => {
			Promise.resolve()
				.then(() => reader.read())
				.then(({ done, value }) => {
					if (done) {
						resolve(bytes.slice(0, loadedBytes));
						return;
					}

					const nextLoadedBytes = loadedBytes + value.byteLength;
					if (nextLoadedBytes > MAX_PRIVATE_STICKER_MANIFEST_BYTES) {
						throw new Error(REMOTE_MANIFEST_SIZE_ERROR);
					}
					bytes.set(value, loadedBytes);
					loadedBytes = nextLoadedBytes;
					readNext();
				})
				.catch(reject);
		};
		readNext();
	});
}

function getResponseReader({
	manifestUrl,
	response,
}: {
	manifestUrl: string;
	response: Response;
}): ReadableStreamDefaultReader<Uint8Array> {
	const body = response.body;
	if (!body || typeof body.getReader !== "function") {
		throw new Error(`Unable to fetch sticker lab manifest: ${manifestUrl}`);
	}

	let reader: ReadableStreamDefaultReader<Uint8Array>;
	try {
		reader = body.getReader();
	} catch {
		throw new Error(`Unable to fetch sticker lab manifest: ${manifestUrl}`);
	}
	if (
		!reader ||
		typeof reader.read !== "function" ||
		typeof reader.cancel !== "function" ||
		typeof reader.releaseLock !== "function"
	) {
		throw new Error(`Unable to fetch sticker lab manifest: ${manifestUrl}`);
	}
	return reader;
}

export async function readRemoteStickerManifestResponse({
	manifestUrl,
	response,
}: {
	manifestUrl: string;
	response: Response;
}): Promise<Uint8Array> {
	const reader = getResponseReader({ manifestUrl, response });
	const contentLength = Number.parseInt(
		response.headers.get("content-length") ?? "",
		10
	);
	let completed = false;
	try {
		if (
			Number.isFinite(contentLength) &&
			contentLength > MAX_PRIVATE_STICKER_MANIFEST_BYTES
		) {
			throw new Error(REMOTE_MANIFEST_SIZE_ERROR);
		}
		const bytes = await readChunks({ reader });
		completed = true;
		return bytes;
	} finally {
		if (!completed) {
			await reader.cancel().catch(() => undefined);
		}
		reader.releaseLock();
	}
}
