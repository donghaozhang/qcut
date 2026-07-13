import { readFile } from "node:fs/promises";
import type { ElectronApplication } from "playwright";

export async function installHttpsMediaFixture({
	electronApp,
	fixturePath,
	mediaUrl,
}: {
	electronApp: ElectronApplication;
	fixturePath: string;
	mediaUrl: string;
}) {
	const fixtureBytes = await readFile(fixturePath);
	const installed = await electronApp.evaluate(
		({ session }, fixture) => {
			const bytes = Buffer.from(fixture.base64, "base64");
			return session.defaultSession.protocol.interceptBufferProtocol(
				"https",
				(request, callback) => {
					if (request.url !== fixture.mediaUrl) {
						callback({ error: -6 });
						return;
					}

					const rangeHeader = request.headers.Range ?? request.headers.range;
					if (!rangeHeader) {
						callback({
							data: bytes,
							headers: {
								"Accept-Ranges": "bytes",
								"Content-Length": String(bytes.length),
							},
							mimeType: "video/mp4",
							statusCode: 200,
						});
						return;
					}

					const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
					const start = match ? Number(match[1]) : Number.NaN;
					const requestedEnd = match?.[2] ? Number(match[2]) : bytes.length - 1;
					if (
						!Number.isInteger(start) ||
						!Number.isInteger(requestedEnd) ||
						start < 0 ||
						start >= bytes.length ||
						requestedEnd < start
					) {
						callback({
							data: Buffer.alloc(0),
							headers: {
								"Accept-Ranges": "bytes",
								"Content-Range": `bytes */${bytes.length}`,
							},
							mimeType: "video/mp4",
							statusCode: 416,
						});
						return;
					}

					const end = Math.min(requestedEnd, bytes.length - 1);
					const body = bytes.subarray(start, end + 1);
					callback({
						data: body,
						headers: {
							"Accept-Ranges": "bytes",
							"Content-Length": String(body.length),
							"Content-Range": `bytes ${start}-${end}/${bytes.length}`,
						},
						mimeType: "video/mp4",
						statusCode: 206,
					});
				}
			);
		},
		{ base64: fixtureBytes.toString("base64"), mediaUrl }
	);
	if (!installed) {
		throw new Error("Failed to install the Electron HTTPS media fixture");
	}
}
