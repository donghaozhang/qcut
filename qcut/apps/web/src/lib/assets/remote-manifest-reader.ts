function readChunks({
	maxBytes,
	reader,
	sizeError,
}: {
	maxBytes: number;
	reader: ReadableStreamDefaultReader<Uint8Array>;
	sizeError: string;
}): Promise<Uint8Array> {
	const bytes = new Uint8Array(maxBytes);
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
					if (nextLoadedBytes > maxBytes) throw new Error(sizeError);
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
	readError,
	response,
}: {
	readError: string;
	response: Response;
}): ReadableStreamDefaultReader<Uint8Array> {
	const body = response.body;
	if (!body || typeof body.getReader !== "function") {
		throw new Error(readError);
	}

	let reader: ReadableStreamDefaultReader<Uint8Array>;
	try {
		reader = body.getReader();
	} catch {
		throw new Error(readError);
	}
	if (
		!reader ||
		typeof reader.read !== "function" ||
		typeof reader.cancel !== "function" ||
		typeof reader.releaseLock !== "function"
	) {
		throw new Error(readError);
	}
	return reader;
}

export async function readRemoteManifestResponse({
	manifestUrl,
	maxBytes,
	response,
	resourceName,
}: {
	manifestUrl: string;
	maxBytes: number;
	response: Response;
	resourceName: string;
}): Promise<Uint8Array> {
	const readError = `Unable to fetch ${resourceName}: ${manifestUrl}`;
	const sizeError = `${resourceName} exceeds ${maxBytes} bytes`;
	const reader = getResponseReader({ readError, response });
	const contentLength = Number.parseInt(
		response.headers.get("content-length") ?? "",
		10
	);
	let completed = false;
	try {
		if (Number.isFinite(contentLength) && contentLength > maxBytes) {
			throw new Error(sizeError);
		}
		const bytes = await readChunks({ maxBytes, reader, sizeError });
		completed = true;
		return bytes;
	} finally {
		if (!completed) await reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
}
