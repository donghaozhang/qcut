const MULTIPART_HEADER_SEPARATOR = "\r\n\r\n";
const MULTIPART_LINE_ENDING = "\r\n";

type DaytonaDownloadHeaders = Record<string, string | string[] | undefined>;

interface DaytonaDownloadResponse {
	data: unknown;
	headers?: DaytonaDownloadHeaders;
}

interface DaytonaDownloadApiClient {
	downloadFiles(
		body: { paths: string[] },
		options: { responseType: "arraybuffer"; timeout: number }
	): Promise<DaytonaDownloadResponse>;
}

interface DaytonaDownloadFileSystem {
	apiClient?: DaytonaDownloadApiClient;
}

interface DaytonaDownloadSandbox {
	fs: DaytonaDownloadFileSystem;
}

interface MultipartPart {
	name: string | null;
	filename: string | null;
	headers: Record<string, string>;
	data: Uint8Array;
}

export async function downloadDaytonaFileBytes({
	sandbox,
	remotePath,
	timeoutSeconds,
}: {
	sandbox: DaytonaDownloadSandbox;
	remotePath: string;
	timeoutSeconds: number;
}): Promise<Uint8Array> {
	const apiClient = sandbox.fs.apiClient;
	if (!apiClient) {
		throw new Error("daytona_download_api_unavailable");
	}

	const response = await apiClient.downloadFiles(
		{ paths: [remotePath] },
		{
			responseType: "arraybuffer",
			timeout: timeoutSeconds * 1000,
		}
	);
	const bodyBytes = await normalizeDownloadResponseBytes({
		data: response.data,
	});
	const contentType = getHeaderValue({
		headers: response.headers,
		key: "content-type",
	});
	if (!contentType.toLowerCase().startsWith("multipart/")) {
		return copyBytes({ bytes: bodyBytes });
	}

	const boundary = extractMultipartBoundary({ contentType });
	if (!boundary) {
		throw new Error("daytona_download_boundary_missing");
	}

	const parts = parseMultipartBody({ bodyBytes, boundary });
	const errorPart = parts.find(
		(part) => part.name === "error" && part.filename === remotePath
	);
	if (errorPart) {
		throw new Error(
			decodeUtf8({ bytes: errorPart.data }) || "daytona_download_failed"
		);
	}

	const filePart =
		parts.find(
			(part) => part.name === "file" && part.filename === remotePath
		) || parts.find((part) => part.name === "file");
	if (!filePart) {
		throw new Error("daytona_download_file_missing");
	}

	return copyBytes({ bytes: filePart.data });
}

async function normalizeDownloadResponseBytes({
	data,
}: {
	data: unknown;
}): Promise<Uint8Array> {
	if (data instanceof ArrayBuffer) {
		return new Uint8Array(data);
	}
	if (ArrayBuffer.isView(data)) {
		return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	}
	if (data instanceof Blob) {
		return new Uint8Array(await data.arrayBuffer());
	}
	if (data instanceof ReadableStream) {
		return new Uint8Array(await new Response(data).arrayBuffer());
	}
	if (typeof data === "string") {
		return new TextEncoder().encode(data);
	}
	throw new Error("daytona_download_response_unsupported");
}

function getHeaderValue({
	headers,
	key,
}: {
	headers?: DaytonaDownloadHeaders;
	key: string;
}): string {
	if (!headers) {
		return "";
	}
	const matchingKey = Object.keys(headers).find(
		(headerKey) => headerKey.toLowerCase() === key.toLowerCase()
	);
	if (!matchingKey) {
		return "";
	}
	const value = headers[matchingKey];
	if (Array.isArray(value)) {
		return value[0] || "";
	}
	return value || "";
}

function extractMultipartBoundary({
	contentType,
}: {
	contentType: string;
}): string | null {
	const match = /boundary="?([^";]+)"?/i.exec(contentType);
	return match ? match[1] : null;
}

function parseMultipartBody({
	bodyBytes,
	boundary,
}: {
	bodyBytes: Uint8Array;
	boundary: string;
}): MultipartPart[] {
	const boundaryBytes = new TextEncoder().encode(`--${boundary}`);
	const boundaryPositions = findByteSequencePositions({
		bytes: bodyBytes,
		sequence: boundaryBytes,
	});
	const parts: MultipartPart[] = [];
	for (let index = 0; index < boundaryPositions.length - 1; index += 1) {
		const part = parseMultipartPart({
			bodyBytes,
			start: boundaryPositions[index],
			end: boundaryPositions[index + 1],
			boundaryLength: boundaryBytes.length,
		});
		if (part) {
			parts.push(part);
		}
	}
	return parts;
}

function parseMultipartPart({
	bodyBytes,
	start,
	end,
	boundaryLength,
}: {
	bodyBytes: Uint8Array;
	start: number;
	end: number;
	boundaryLength: number;
}): MultipartPart | null {
	const headerStart = start + boundaryLength + MULTIPART_LINE_ENDING.length;
	if (headerStart >= end) {
		return null;
	}

	const separatorBytes = new TextEncoder().encode(MULTIPART_HEADER_SEPARATOR);
	const separator = findByteSequence({
		bytes: bodyBytes,
		sequence: separatorBytes,
		start: headerStart,
		end,
	});
	if (separator < 0) {
		return null;
	}

	const headersText = decodeUtf8({
		bytes: bodyBytes.subarray(headerStart, separator),
	});
	const headers = parseMultipartHeaders({ headersText });
	const disposition = headers["content-disposition"] || "";
	const dataStart = separator + separatorBytes.length;
	const dataEnd =
		end >= MULTIPART_LINE_ENDING.length &&
		decodeUtf8({
			bytes: bodyBytes.subarray(end - MULTIPART_LINE_ENDING.length, end),
		}) === MULTIPART_LINE_ENDING
			? end - MULTIPART_LINE_ENDING.length
			: end;

	return {
		name: getDispositionParam({ disposition, key: "name" }),
		filename: getDispositionParam({ disposition, key: "filename" }),
		headers,
		data: bodyBytes.subarray(dataStart, Math.max(dataStart, dataEnd)),
	};
}

function parseMultipartHeaders({
	headersText,
}: {
	headersText: string;
}): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const line of headersText.split(MULTIPART_LINE_ENDING)) {
		const separator = line.indexOf(":");
		if (separator <= 0) {
			continue;
		}
		const key = line.slice(0, separator).trim().toLowerCase();
		const value = line.slice(separator + 1).trim();
		headers[key] = value;
	}
	return headers;
}

function getDispositionParam({
	disposition,
	key,
}: {
	disposition: string;
	key: string;
}): string | null {
	const match = new RegExp(`${key}\\*?=([^;]+)`, "i").exec(disposition);
	if (!match) {
		return null;
	}
	return match[1].replace(/^"|"$/g, "").trim();
}

function findByteSequencePositions({
	bytes,
	sequence,
}: {
	bytes: Uint8Array;
	sequence: Uint8Array;
}): number[] {
	const positions: number[] = [];
	let start = 0;
	while (start <= bytes.length - sequence.length) {
		const position = findByteSequence({
			bytes,
			sequence,
			start,
			end: bytes.length,
		});
		if (position < 0) {
			break;
		}
		positions.push(position);
		start = position + sequence.length;
	}
	return positions;
}

function findByteSequence({
	bytes,
	sequence,
	start,
	end,
}: {
	bytes: Uint8Array;
	sequence: Uint8Array;
	start: number;
	end: number;
}): number {
	for (let index = start; index <= end - sequence.length; index += 1) {
		let matched = true;
		for (let offset = 0; offset < sequence.length; offset += 1) {
			if (bytes[index + offset] !== sequence[offset]) {
				matched = false;
				break;
			}
		}
		if (matched) {
			return index;
		}
	}
	return -1;
}

function copyBytes({ bytes }: { bytes: Uint8Array }): Uint8Array {
	const output = new Uint8Array(bytes.byteLength);
	output.set(bytes);
	return output;
}

function decodeUtf8({ bytes }: { bytes: Uint8Array }): string {
	return new TextDecoder().decode(bytes);
}
