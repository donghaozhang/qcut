import { createRequire } from "node:module";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";
import { net, type Protocol } from "electron";
import { createVideoPreviewProxyResponse } from "../ffmpeg/video-preview-proxy-response";
import { prepareHyperframesDocument } from "./document";
import { hyperframesOutputRegistry } from "./output-registry";
import { resolveHyperframesAsset } from "./source-security";
import type { HyperframesSessionRegistry } from "./session-registry";

export const HYPERFRAMES_PROTOCOL = "qcut-hyperframes";

const nodeRequire = createRequire(__filename);
let cachedRuntimeSource: string | null = null;

function getRuntimeSource(): string {
	if (cachedRuntimeSource) return cachedRuntimeSource;
	const runtimePath = nodeRequire.resolve("@hyperframes/core/runtime");
	cachedRuntimeSource = fs.readFileSync(runtimePath, "utf8");
	return cachedRuntimeSource;
}

function htmlHeaders(): Headers {
	return new Headers({
		"content-type": "text/html; charset=utf-8",
		"cache-control": "no-store",
		"content-security-policy":
			"default-src 'self' data: blob: https: http:; " +
			"script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http: blob:; " +
			"style-src 'self' 'unsafe-inline' https: http:; " +
			"font-src 'self' data: https: http:; " +
			"img-src 'self' data: blob: https: http:; " +
			"media-src 'self' data: blob: https: http:; " +
			"connect-src 'self' data: blob: https: http: ws: wss:;",
	});
}

export function registerHyperframesProtocol({
	targetProtocol,
	registry,
	logger = console,
}: {
	targetProtocol: Pick<Protocol, "handle">;
	registry: HyperframesSessionRegistry;
	logger?: Pick<Console, "error">;
}): void {
	targetProtocol.handle(HYPERFRAMES_PROTOCOL, async (request) => {
		try {
			const url = new URL(request.url);
			const session = registry.get({ token: url.hostname });
			const requestedPath = url.pathname.replace(/^\/+/, "") || "index.html";
			if (!session) {
				const outputSession = hyperframesOutputRegistry.get({
					sessionId: url.hostname,
				});
				if (!outputSession || requestedPath !== "composition.webm") {
					return new Response("Not Found", { status: 404 });
				}
				return createVideoPreviewProxyResponse({
					request,
					filePath: outputSession.browserOutputPath,
					contentType: "video/webm",
				});
			}

			if (requestedPath === "index.html") {
				const baseUrl = `${HYPERFRAMES_PROTOCOL}://${session.token}/`;
				const document = prepareHyperframesDocument({
					html: session.html,
					baseUrl,
					variables: session.variables,
					runtimeSource: getRuntimeSource(),
				});
				return new Response(document, {
					status: 200,
					headers: htmlHeaders(),
				});
			}

			const assetPath = resolveHyperframesAsset({
				projectPath: session.projectPath,
				urlPath: requestedPath,
			});
			if (!assetPath) return new Response("Not Found", { status: 404 });
			return net.fetch(pathToFileURL(assetPath).toString());
		} catch (error) {
			logger.error("[HyperFramesProtocol] Request failed:", error);
			return new Response("Internal Server Error", { status: 500 });
		}
	});
}
