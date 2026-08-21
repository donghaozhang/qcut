/**
 * Local media streaming over the `app://` protocol.
 *
 * `app://local-media/<base64url(absolute path)>` streams a media file from
 * disk with Range support, so the renderer can play project media without
 * routing the whole file through IPC into a blob. Paths are only served when
 * their realpath lives under an allowed root (the qcut-videos temp
 * extraction dir or the app's userData tree), which keeps the route from
 * becoming an arbitrary-file read.
 *
 * @module electron/local-media-protocol
 */

import { app } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";

export const LOCAL_MEDIA_PROTOCOL_PATH = "local-media";

const CONTENT_TYPES: Record<string, string> = {
	".mp4": "video/mp4",
	".m4v": "video/mp4",
	".mov": "video/quicktime",
	".webm": "video/webm",
	".mkv": "video/x-matroska",
	".avi": "video/x-msvideo",
	".mp3": "audio/mpeg",
	".wav": "audio/wav",
	".m4a": "audio/mp4",
	".aac": "audio/aac",
	".ogg": "audio/ogg",
	".flac": "audio/flac",
};

export function localMediaContentType({
	filePath,
}: {
	filePath: string;
}): string {
	return (
		CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
		"application/octet-stream"
	);
}

function allowedRoots(): string[] {
	// Media directories only — never the userData root itself, which holds
	// cookies, auth caches and API-key stores the renderer must not read.
	return [
		path.join(app.getPath("temp"), "qcut-videos"),
		path.join(app.getPath("documents"), "QCut", "Projects"),
		path.join(app.getPath("userData"), "projects"),
	];
}

function isUnderRoot({ real, root }: { real: string; root: string }): boolean {
	let realRoot: string;
	try {
		realRoot = fs.realpathSync(root);
	} catch {
		return false;
	}
	return real === realRoot || real.startsWith(realRoot + path.sep);
}

/**
 * Decodes a protocol token back to a served file path, or null when the
 * token is malformed, the file is missing, or its realpath escapes every
 * allowed root (symlinks resolved on both sides).
 */
export function resolveLocalMediaFilename({
	token,
}: {
	token: string;
}): string | null {
	let decoded: string;
	try {
		decoded = Buffer.from(token, "base64url").toString("utf8");
	} catch {
		return null;
	}
	if (!decoded || !path.isAbsolute(decoded)) return null;
	let real: string;
	try {
		real = fs.realpathSync(decoded);
	} catch {
		return null;
	}
	if (!fs.statSync(real).isFile()) return null;
	return allowedRoots().some((root) => isUnderRoot({ real, root }))
		? real
		: null;
}
