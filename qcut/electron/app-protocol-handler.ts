/**
 * App Protocol Handler
 *
 * Registers the custom `app://` protocol so the packaged renderer (and the
 * hidden headless-recorder window) can resolve URLs like
 * `app://./index.html` and `app://ffmpeg/…` to files inside `apps/web/dist`
 * and the packaged `resources/ffmpeg` directory.
 *
 * Extracted from `main.ts` so headless-recorder mode (which skips the
 * normal main-window boot) can call it too.
 *
 * @module electron/app-protocol-handler
 */

import { app, net, protocol } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import {
	resolveVideoPreviewProxyFilename,
	VIDEO_PREVIEW_PROXY_PROTOCOL_PATH,
} from "./ffmpeg/video-preview-proxy-cache.js";
import { createVideoPreviewProxyResponse } from "./ffmpeg/video-preview-proxy-response.js";
import {
	JIANYING_TRANSITION_PREVIEW_PROTOCOL_PATH,
	resolveJianyingTransitionPreviewFilename,
} from "./jianying-transition/preview-cache-path.js";
import {
	JIANYING_TEXT_PREVIEW_PROTOCOL_PATH,
	resolveJianyingTextPreviewFilename,
} from "./jianying-text-runtime/cache-path.js";
import {
	LOCAL_MEDIA_PROTOCOL_PATH,
	localMediaContentType,
	resolveLocalMediaFilename,
} from "./local-media-protocol.js";

export interface RegisterAppProtocolOptions {
	/** Override the logger — defaults to console. */
	logger?: Pick<Console, "log" | "error">;
}

/** Resolve the dist path for the web renderer, both packaged and dev. */
function resolveBasePath(): string {
	return app.isPackaged
		? path.join(app.getAppPath(), "apps/web/dist")
		: path.join(__dirname, "../../apps/web/dist");
}

/**
 * Register the `app://` protocol handler on the default session.
 *
 * Must be called inside `app.whenReady()` (or after) because Electron's
 * `protocol.handle` requires the app to be ready.
 */
export function registerAppProtocol(
	options: RegisterAppProtocolOptions = {}
): void {
	const logger = options.logger ?? console;
	const basePath = resolveBasePath();

	logger.log(`[Protocol] Base path: ${basePath}`);
	logger.log(`[Protocol] Base path exists: ${fs.existsSync(basePath)}`);

	protocol.handle("app", async (request) => {
		let urlPath = request.url.slice("app://".length);

		// Strip URL query string / hash before resolving to a filesystem path.
		// Without this, `app://./index.html?headlessRecord=1` would resolve to
		// a file literally named `index.html?headlessRecord=1` and 404.
		const queryIndex = urlPath.search(/[?#]/);
		if (queryIndex !== -1) {
			urlPath = urlPath.slice(0, queryIndex);
		}

		// Clean up the URL path
		if (urlPath.startsWith("./")) {
			urlPath = urlPath.substring(2);
		}
		if (urlPath.startsWith("/")) {
			urlPath = urlPath.substring(1);
		}

		// Default to index.html for root
		if (!urlPath || urlPath === "") {
			urlPath = "index.html";
		}

		// Security: Block path traversal attempts
		// Check for ".." before normalization to catch traversal attempts
		if (urlPath.includes("..")) {
			logger.error(`[Protocol] Path traversal blocked: ${urlPath}`);
			return new Response("Not Found", { status: 404 });
		}
		// Normalize path for consistent handling (converts / to \ on Windows).
		// Split on either separator so the leading-segment check below works
		// cross-platform — `path.normalize("ffmpeg/foo")` on Windows produces
		// `ffmpeg\foo`, which would defeat a `startsWith("ffmpeg/")` test.
		const normalizedPath = path.normalize(urlPath);
		const pathSegments = normalizedPath.split(/[\\/]+/);

		try {
			if (pathSegments[0] === JIANYING_TEXT_PREVIEW_PROTOCOL_PATH) {
				const filename = pathSegments[1];
				if (pathSegments.length !== 2 || !filename) {
					return new Response("Not Found", { status: 404 });
				}
				const previewPath = resolveJianyingTextPreviewFilename({ filename });
				if (!previewPath || !fs.existsSync(previewPath)) {
					return new Response("Not Found", { status: 404 });
				}
				return createVideoPreviewProxyResponse({
					request,
					filePath: previewPath,
					contentType: "video/webm",
				});
			}

			if (pathSegments[0] === JIANYING_TRANSITION_PREVIEW_PROTOCOL_PATH) {
				const filename = pathSegments[1];
				if (pathSegments.length !== 2 || !filename) {
					return new Response("Not Found", { status: 404 });
				}
				const previewPath = resolveJianyingTransitionPreviewFilename({
					filename,
				});
				if (!previewPath || !fs.existsSync(previewPath)) {
					return new Response("Not Found", { status: 404 });
				}
				return createVideoPreviewProxyResponse({
					request,
					filePath: previewPath,
				});
			}

			if (pathSegments[0] === LOCAL_MEDIA_PROTOCOL_PATH) {
				const token = pathSegments[1];
				if (pathSegments.length !== 2 || !token) {
					return new Response("Not Found", { status: 404 });
				}
				const mediaPath = resolveLocalMediaFilename({ token });
				if (!mediaPath) {
					return new Response("Not Found", { status: 404 });
				}
				return createVideoPreviewProxyResponse({
					request,
					filePath: mediaPath,
					contentType: localMediaContentType({ filePath: mediaPath }),
				});
			}

			if (pathSegments[0] === VIDEO_PREVIEW_PROXY_PROTOCOL_PATH) {
				const filename = pathSegments[1];
				if (pathSegments.length !== 2 || !filename) {
					return new Response("Not Found", { status: 404 });
				}
				const proxyPath = resolveVideoPreviewProxyFilename({ filename });
				if (!proxyPath || !fs.existsSync(proxyPath)) {
					return new Response("Not Found", { status: 404 });
				}
				return createVideoPreviewProxyResponse({
					request,
					filePath: proxyPath,
				});
			}

			// Handle FFmpeg resources specifically
			if (pathSegments[0] === "ffmpeg") {
				const filename = pathSegments.slice(1).join(path.sep);
				// In packaged builds the FFmpeg binaries are extracted out of
				// app.asar via asarUnpack to process.resourcesPath/ffmpeg.
				// In dev they live alongside the basePath under ./ffmpeg.
				const ffmpegPath = app.isPackaged
					? path.join(process.resourcesPath, "ffmpeg", filename)
					: path.join(basePath, "ffmpeg", filename);

				if (fs.existsSync(ffmpegPath)) {
					return await net.fetch(pathToFileURL(ffmpegPath).toString());
				}

				// Fallback to dist directory
				const distPath = path.join(basePath, "ffmpeg", filename);
				return await net.fetch(pathToFileURL(distPath).toString());
			}

			// Handle other resources with path containment check
			const filePath = path.resolve(basePath, normalizedPath);
			const baseResolved = path.resolve(basePath) + path.sep;

			// Ensure resolved path stays within basePath
			if (
				!filePath.startsWith(baseResolved) &&
				filePath !== path.resolve(basePath)
			) {
				logger.error(`[Protocol] Path traversal blocked: ${normalizedPath}`);
				return new Response("Not Found", { status: 404 });
			}

			if (fs.existsSync(filePath)) {
				logger.log(`[Protocol] Serving: ${normalizedPath} -> ${filePath}`);
				return await net.fetch(pathToFileURL(filePath).toString());
			}

			// SPA fallback: serve index.html for navigation requests without file extensions
			if (!path.extname(normalizedPath)) {
				const indexPath = path.join(basePath, "index.html");
				if (fs.existsSync(indexPath)) {
					logger.log(
						`[Protocol] SPA fallback: ${normalizedPath} -> index.html`
					);
					return await net.fetch(pathToFileURL(indexPath).toString());
				}
			}

			logger.error(`[Protocol] File not found: ${filePath}`);
			return new Response("Not Found", { status: 404 });
		} catch (error) {
			logger.error(`[Protocol] Error fetching ${normalizedPath}:`, error);
			return new Response("Internal Server Error", { status: 500 });
		}
	});
}
