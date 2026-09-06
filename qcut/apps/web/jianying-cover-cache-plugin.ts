import type { Plugin } from "vite";
import { listPrivateCovers } from "../../electron/jianying-cover-private-cache";

export function jianyingCoverCachePlugin(): Plugin {
	return {
		name: "qcut-private-cover-cache",
		apply: "serve",
		configureServer(server) {
			server.middlewares.use(
				"/__qcut/private-covers",
				(request, response, next) => {
					if (request.url !== "/" && request.url !== "") return next();
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
					if (request.method !== "GET") {
						response.writeHead(405, { Allow: "GET" }).end();
						return;
					}
					response.setHeader("Cache-Control", "no-store");
					response.setHeader("Content-Type", "application/json");
					void listPrivateCovers()
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
