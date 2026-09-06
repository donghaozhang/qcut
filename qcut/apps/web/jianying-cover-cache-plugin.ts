import type { Plugin } from "vite";
import { listPrivateCovers } from "../../electron/jianying-cover-private-cache";
import { preparePrivateCoverTextLayout } from "../../electron/jianying-cover-prepare-layout";
import { readPrivateCoverFont } from "../../electron/jianying-cover-font";
import type { IncomingMessage } from "node:http";

function readFontRequest({
	request,
}: {
	request: IncomingMessage;
}): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		request.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > 32768) {
				reject(new Error("Font request too large"));
				return;
			}
			chunks.push(chunk);
		});
		request.on("error", reject);
		request.on("aborted", () => reject(new Error("Font request aborted")));
		request.on("end", () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch (error) {
				reject(error);
			}
		});
	});
}

export function jianyingCoverCachePlugin(): Plugin {
	return {
		name: "qcut-private-cover-cache",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use(
				"/__qcut/private-covers",
				(request, response, next) => {
					const layout = /^\/layout\/([a-f\d]{32})$/.exec(request.url ?? "");
					const font = request.url === "/font";
					if (request.url !== "/" && request.url !== "" && !layout && !font)
						return next();
					const host = request.headers.host ?? "";
					const localHost = /^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(
						host
					);
					const origin = request.headers.origin;
					const crossOrigin =
						origin !== undefined && origin !== `http://${host}`;
					if (
						!localHost ||
						crossOrigin ||
						request.headers["sec-fetch-site"] === "cross-site"
					) {
						response.writeHead(403).end();
						return;
					}
					const method = layout || font ? "POST" : "GET";
					if (request.method !== method) {
						response.writeHead(405, { Allow: method }).end();
						return;
					}
					response.setHeader("Cache-Control", "no-store");
					response.setHeader("Content-Type", "application/json");
					const operation = layout
						? preparePrivateCoverTextLayout({
								request: { packageHash: layout[1] },
							})
						: font
							? readFontRequest({ request }).then((value) =>
									readPrivateCoverFont({ request: value })
								)
							: listPrivateCovers();
					void operation
						.then((catalog) => {
							response.end(JSON.stringify(catalog));
						})
						.catch(() => {
							response.writeHead(500).end(
								JSON.stringify({
									error: "Private cover cache failed integrity validation",
								})
							);
						});
				}
			);
		},
	};
}
