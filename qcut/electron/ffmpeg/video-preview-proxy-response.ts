import fs from "node:fs";
import { Readable } from "node:stream";

interface ByteRange {
	start: number;
	end: number;
}

function parseByteRange({
	header,
	fileSize,
}: {
	header: string;
	fileSize: number;
}): ByteRange | null {
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return null;
	const startText = match[1] ?? "";
	const endText = match[2] ?? "";
	if (!startText && !endText) return null;
	if (!startText) {
		const suffixLength = Number(endText);
		if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
		return {
			start: Math.max(0, fileSize - suffixLength),
			end: fileSize - 1,
		};
	}
	const start = Number(startText);
	const requestedEnd = endText ? Number(endText) : fileSize - 1;
	if (
		!Number.isInteger(start) ||
		!Number.isInteger(requestedEnd) ||
		start < 0 ||
		start >= fileSize ||
		requestedEnd < start
	) {
		return null;
	}
	return { start, end: Math.min(requestedEnd, fileSize - 1) };
}

function responseHeaders({
	contentLength,
	contentRange,
}: {
	contentLength: number;
	contentRange?: string;
}): Headers {
	const headers = new Headers({
		"Accept-Ranges": "bytes",
		"Cache-Control": "public, max-age=31536000, immutable",
		"Content-Length": String(contentLength),
		"Content-Type": "video/mp4",
	});
	if (contentRange) headers.set("Content-Range", contentRange);
	return headers;
}

export function createVideoPreviewProxyResponse({
	request,
	filePath,
}: {
	request: Request;
	filePath: string;
}): Response {
	const fileSize = fs.statSync(filePath).size;
	const rangeHeader = request.headers.get("range");
	const range = rangeHeader
		? parseByteRange({ header: rangeHeader, fileSize })
		: null;
	if (rangeHeader && !range) {
		return new Response(null, {
			status: 416,
			headers: {
				"Accept-Ranges": "bytes",
				"Content-Range": `bytes */${fileSize}`,
			},
		});
	}
	const start = range?.start ?? 0;
	const end = range?.end ?? fileSize - 1;
	const contentLength = end - start + 1;
	const headers = responseHeaders({
		contentLength,
		contentRange: range ? `bytes ${start}-${end}/${fileSize}` : undefined,
	});
	if (request.method === "HEAD") {
		return new Response(null, { status: range ? 206 : 200, headers });
	}
	const nodeStream = fs.createReadStream(filePath, { start, end });
	const destroyStream = () => nodeStream.destroy();
	if (request.signal.aborted) destroyStream();
	request.signal.addEventListener("abort", destroyStream, { once: true });
	nodeStream.once("close", () =>
		request.signal.removeEventListener("abort", destroyStream)
	);
	return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
		status: range ? 206 : 200,
		headers,
	});
}

export const videoPreviewProxyResponseTestUtils = { parseByteRange };
