import type { Context } from "hono";

import {
	MAX_SESSION_UPLOAD_BYTES,
	MAX_TERMINAL_ARTIFACTS,
	TERMINAL_INPUT_DIR,
	TERMINAL_OUTPUT_DIR,
} from "./constants";
import { getDaytonaSandboxForSession, type DaytonaSandbox } from "./daytona";
import { downloadDaytonaFileBytes } from "../../services/daytona-download";
import { getRequestAgentSession } from "./sessions";
import {
	escapeContentDispositionFilename,
	getContentTypeByFilename,
	serializeSandboxFile,
	serializeSessionFile,
	serializeTerminalArtifact,
} from "./serializers";
import {
	extractUploadFiles,
	getSandboxParentPath,
	getSandboxPathBasename,
	joinSandboxPath,
	normalizeSandboxPath,
	normalizeSessionFileFolder,
	normalizeTerminalArtifactFilename,
	normalizeUploadedFilename,
	shellSingleQuote,
} from "./validation";

export async function listAgentSessionArtifacts(c: Context) {
	const userId = c.get("userId") as string;
	const session = await getRequestAgentSession({ c, userId });
	if (!session) {
		return c.json({ error: "agent_session_not_found" }, 404);
	}
	if (!session.providerSessionId) {
		return c.json({ artifacts: [] });
	}

	const sandbox = await getDaytonaSandboxForSession({ session });
	let files: Array<{ isDir?: boolean; name?: string; size?: number }>;
	try {
		files = await sandbox.fs.listFiles(TERMINAL_OUTPUT_DIR);
	} catch {
		files = [];
	}
	const fileArtifacts = parseTerminalArtifactFiles({ files });
	const terminalArtifacts =
		fileArtifacts.length > 0
			? fileArtifacts
			: await listTerminalArtifactsViaShell({ sandbox });
	const artifacts = terminalArtifacts
		.slice(0, MAX_TERMINAL_ARTIFACTS)
		.map((artifact) =>
			serializeTerminalArtifact({
				sessionId: session.id,
				artifact,
			})
		);

	return c.json({ artifacts });
}

export async function listAgentSessionFiles(c: Context) {
	const userId = c.get("userId") as string;
	const session = await getRequestAgentSession({ c, userId });
	if (!session) {
		return c.json({ error: "agent_session_not_found" }, 404);
	}
	if (!session.providerSessionId) {
		const path = normalizeSandboxPath({ value: c.req.query("path") });
		if (c.req.query("path") !== undefined && !path) {
			return c.json({ error: "session_file_path_invalid" }, 400);
		}
		return c.json({
			path: path ?? null,
			parentPath: path ? getSandboxParentPath({ path }) : null,
			files: [],
		});
	}

	const sandbox = await getDaytonaSandboxForSession({ session });
	const requestedPath = c.req.query("path");
	if (requestedPath !== undefined) {
		const path = normalizeSandboxPath({ value: requestedPath });
		if (!path) {
			return c.json({ error: "session_file_path_invalid" }, 400);
		}
		const files = await listSandboxFilesForPath({ sandbox, path });
		return c.json({
			path,
			parentPath: getSandboxParentPath({ path }),
			files: files
				.slice(0, MAX_TERMINAL_ARTIFACTS)
				.map((file) => serializeSandboxFile({ sessionId: session.id, file })),
		});
	}

	const [inputFiles, outputFiles] = await Promise.all([
		listTerminalFilesForDir({
			sandbox,
			dir: TERMINAL_INPUT_DIR,
			folder: "input",
		}),
		listTerminalFilesForDir({
			sandbox,
			dir: TERMINAL_OUTPUT_DIR,
			folder: "output",
		}),
	]);

	return c.json({
		files: [...inputFiles, ...outputFiles]
			.slice(0, MAX_TERMINAL_ARTIFACTS)
			.map((file) => serializeSessionFile({ sessionId: session.id, file })),
	});
}

export async function uploadAgentSessionFiles(c: Context) {
	const userId = c.get("userId") as string;
	const session = await getRequestAgentSession({ c, userId });
	if (!session) {
		return c.json({ error: "agent_session_not_found" }, 404);
	}
	if (!session.providerSessionId) {
		return c.json({ error: "agent_session_sandbox_not_ready" }, 409);
	}

	const requestedPath = c.req.query("path");
	const uploadDir =
		requestedPath === undefined
			? TERMINAL_INPUT_DIR
			: normalizeSandboxPath({ value: requestedPath });
	if (!uploadDir) {
		return c.json({ error: "session_file_path_invalid" }, 400);
	}
	const body = await c.req.parseBody({ all: true });
	const uploads = extractUploadFiles({ body });
	if (uploads.length === 0) {
		return c.json({ error: "upload_file_required" }, 400);
	}

	const sandbox = await getDaytonaSandboxForSession({ session });
	if (uploadDir !== "/") {
		await sandbox.fs.createFolder(uploadDir, "755").catch(() => {});
	}

	// Validate the entire batch before writing anything, so a later invalid
	// entry can't leave earlier files persisted with a failed response.
	const validatedUploads: Array<{
		file: File;
		filename: string;
		bytes: number;
	}> = [];
	for (const file of uploads) {
		const filename = normalizeUploadedFilename({ value: file.name });
		if (!filename) {
			return c.json({ error: "upload_filename_invalid" }, 400);
		}
		if (file.size > MAX_SESSION_UPLOAD_BYTES) {
			return c.json({ error: "upload_file_too_large" }, 413);
		}
		validatedUploads.push({ file, filename, bytes: file.size });
	}

	const uploaded: Array<{ filename: string; bytes: number }> = [];
	for (const { file, filename, bytes } of validatedUploads) {
		await sandbox.fs.uploadFile(
			Buffer.from(await file.arrayBuffer()),
			joinSandboxPath({ dir: uploadDir, filename }),
			10 * 60
		);
		uploaded.push({ filename, bytes });
	}

	return c.json(
		{
			files: uploaded.map((file) => {
				if (requestedPath !== undefined) {
					return serializeSandboxFile({
						sessionId: session.id,
						file: {
							...file,
							isDir: false,
							path: joinSandboxPath({
								dir: uploadDir,
								filename: file.filename,
							}),
							parentPath: uploadDir,
						},
					});
				}
				return serializeSessionFile({
					sessionId: session.id,
					file: {
						...file,
						folder: "input",
						dir: TERMINAL_INPUT_DIR,
					},
				});
			}),
		},
		201
	);
}

export async function downloadAgentSessionArtifact(c: Context) {
	const userId = c.get("userId") as string;
	const session = await getRequestAgentSession({ c, userId });
	if (!session) {
		return c.json({ error: "agent_session_not_found" }, 404);
	}
	if (!session.providerSessionId) {
		return c.json({ error: "agent_session_sandbox_not_ready" }, 409);
	}

	const filename = normalizeTerminalArtifactFilename({
		value: c.req.param("filename"),
	});
	if (!filename) {
		return c.json({ error: "artifact_filename_invalid" }, 400);
	}

	const sandbox = await getDaytonaSandboxForSession({ session });
	const remotePath = `${TERMINAL_OUTPUT_DIR}/${filename}`;
	const fileBytes = await downloadDaytonaFileBytes({
		sandbox,
		remotePath,
		timeoutSeconds: 10 * 60,
	});
	const headers: Record<string, string> = {
		"Content-Disposition": `attachment; filename="${escapeContentDispositionFilename({ filename })}"`,
		"Content-Type": getContentTypeByFilename({ filename }),
		"Content-Length": String(fileBytes.byteLength),
	};

	return c.body(bytesToArrayBuffer({ bytes: fileBytes }), 200, headers);
}

export async function downloadAgentSessionFilesystemPath(c: Context) {
	const userId = c.get("userId") as string;
	const session = await getRequestAgentSession({ c, userId });
	if (!session) {
		return c.json({ error: "agent_session_not_found" }, 404);
	}
	if (!session.providerSessionId) {
		return c.json({ error: "agent_session_sandbox_not_ready" }, 409);
	}

	const path = normalizeSandboxPath({ value: c.req.query("path") });
	if (!path || path === "/") {
		return c.json({ error: "session_file_path_invalid" }, 400);
	}

	const filename = getSandboxPathBasename({ path });
	if (!filename) {
		return c.json({ error: "session_file_filename_invalid" }, 400);
	}

	const sandbox = await getDaytonaSandboxForSession({ session });
	if (c.req.query("archive") === "tar") {
		return downloadAgentSessionFilesystemDirectory({
			c,
			sandbox,
			path,
			filename,
		});
	}
	const fileBytes = await downloadDaytonaFileBytes({
		sandbox,
		remotePath: path,
		timeoutSeconds: 10 * 60,
	});
	const headers: Record<string, string> = {
		"Content-Disposition": `attachment; filename="${escapeContentDispositionFilename({ filename })}"`,
		"Content-Type": getContentTypeByFilename({ filename }),
		"Content-Length": String(fileBytes.byteLength),
	};

	return c.body(bytesToArrayBuffer({ bytes: fileBytes }), 200, headers);
}

async function downloadAgentSessionFilesystemDirectory({
	c,
	sandbox,
	path,
	filename,
}: {
	c: Context;
	sandbox: DaytonaSandbox;
	path: string;
	filename: string;
}) {
	let archivePath: string;
	try {
		archivePath = await createSandboxDirectoryArchive({ sandbox, path });
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === "session_file_path_not_directory"
		) {
			return c.json({ error: "session_file_path_not_directory" }, 400);
		}
		throw error;
	}
	try {
		const fileBytes = await downloadDaytonaFileBytes({
			sandbox,
			remotePath: archivePath,
			timeoutSeconds: 10 * 60,
		});
		const archiveFilename = `${filename}.tar.gz`;
		const headers: Record<string, string> = {
			"Content-Disposition": `attachment; filename="${escapeContentDispositionFilename({ filename: archiveFilename })}"`,
			"Content-Type": "application/gzip",
			"Content-Length": String(fileBytes.byteLength),
		};
		return c.body(bytesToArrayBuffer({ bytes: fileBytes }), 200, headers);
	} finally {
		await sandbox.process
			.executeCommand(
				`rm -f ${shellSingleQuote({ value: archivePath })}`,
				"/tmp",
				undefined,
				30
			)
			.catch(() => {});
	}
}

export async function downloadAgentSessionFile(c: Context) {
	const userId = c.get("userId") as string;
	const session = await getRequestAgentSession({ c, userId });
	if (!session) {
		return c.json({ error: "agent_session_not_found" }, 404);
	}
	if (!session.providerSessionId) {
		return c.json({ error: "agent_session_sandbox_not_ready" }, 409);
	}

	const folder = normalizeSessionFileFolder({ value: c.req.param("folder") });
	if (!folder) {
		return c.json({ error: "session_file_folder_invalid" }, 400);
	}

	const filename = normalizeTerminalArtifactFilename({
		value: c.req.param("filename"),
	});
	if (!filename) {
		return c.json({ error: "session_file_filename_invalid" }, 400);
	}

	const dir = folder === "input" ? TERMINAL_INPUT_DIR : TERMINAL_OUTPUT_DIR;
	const sandbox = await getDaytonaSandboxForSession({ session });
	const fileBytes = await downloadDaytonaFileBytes({
		sandbox,
		remotePath: `${dir}/${filename}`,
		timeoutSeconds: 10 * 60,
	});
	const headers: Record<string, string> = {
		"Content-Disposition": `attachment; filename="${escapeContentDispositionFilename({ filename })}"`,
		"Content-Type": getContentTypeByFilename({ filename }),
		"Content-Length": String(fileBytes.byteLength),
	};

	return c.body(bytesToArrayBuffer({ bytes: fileBytes }), 200, headers);
}

function bytesToArrayBuffer({ bytes }: { bytes: Uint8Array }): ArrayBuffer {
	const body = new Uint8Array(bytes.byteLength);
	body.set(bytes);
	return body.buffer;
}

export function parseTerminalArtifactList({
	stdout,
}: {
	stdout: string;
}): Array<{ filename: string; bytes: number }> {
	return stdout
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0)
		.flatMap((line) => {
			const [filename, rawBytes] = line.split("\t");
			const safeFilename = normalizeTerminalArtifactFilename({
				value: filename,
			});
			if (!safeFilename) {
				return [];
			}
			const bytes = Number(rawBytes);
			return [
				{
					filename: safeFilename,
					bytes: Number.isFinite(bytes) && bytes >= 0 ? bytes : 0,
				},
			];
		});
}

export function parseTerminalArtifactFiles({
	files,
}: {
	files: Array<{ isDir?: boolean; name?: string; size?: number }>;
}): Array<{ filename: string; bytes: number }> {
	return files
		.filter((file) => !file.isDir)
		.flatMap((file) => {
			const safeFilename = normalizeTerminalArtifactFilename({
				value: file.name,
			});
			if (!safeFilename) {
				return [];
			}
			const bytes = Number(file.size);
			return [
				{
					filename: safeFilename,
					bytes: Number.isFinite(bytes) && bytes >= 0 ? bytes : 0,
				},
			];
		})
		.sort((left, right) => left.filename.localeCompare(right.filename));
}

async function listTerminalArtifactsViaShell({
	sandbox,
}: {
	sandbox: DaytonaSandbox;
}): Promise<Array<{ filename: string; bytes: number }>> {
	const result = await sandbox.process.executeCommand(
		buildTerminalArtifactListCommand(),
		"/home/qcut/qcut",
		undefined,
		30
	);
	const stdout = typeof result.result === "string" ? result.result : "";
	return parseTerminalArtifactList({ stdout });
}

async function listTerminalFilesForDir({
	sandbox,
	dir,
	folder,
}: {
	sandbox: DaytonaSandbox;
	dir: string;
	folder: "input" | "output";
}): Promise<
	Array<{
		filename: string;
		bytes: number;
		folder: "input" | "output";
		dir: string;
	}>
> {
	let files: Array<{ isDir?: boolean; name?: string; size?: number }>;
	try {
		files = await sandbox.fs.listFiles(dir);
	} catch {
		files = [];
	}
	return parseTerminalArtifactFiles({ files }).map((file) => ({
		...file,
		folder,
		dir,
	}));
}

async function listSandboxFilesForPath({
	sandbox,
	path,
}: {
	sandbox: DaytonaSandbox;
	path: string;
}): Promise<
	Array<{
		filename: string;
		bytes: number;
		isDir: boolean;
		path: string;
		parentPath: string;
	}>
> {
	let files: Array<{ isDir?: boolean; name?: string; size?: number }>;
	try {
		files = await sandbox.fs.listFiles(path);
	} catch {
		files = [];
	}
	return files
		.flatMap((file) => {
			const filename = normalizeTerminalArtifactFilename({
				value: file.name,
			});
			if (!filename) {
				return [];
			}
			const bytes = Number(file.size);
			return [
				{
					filename,
					bytes: Number.isFinite(bytes) && bytes >= 0 ? bytes : 0,
					isDir: Boolean(file.isDir),
					path: joinSandboxPath({ dir: path, filename }),
					parentPath: path,
				},
			];
		})
		.sort((left, right) => {
			if (left.isDir !== right.isDir) {
				return left.isDir ? -1 : 1;
			}
			return left.filename.localeCompare(right.filename);
		});
}

export function buildTerminalArtifactListCommand(): string {
	const script = [
		`if [ -d ${TERMINAL_OUTPUT_DIR} ]; then`,
		`for file in ${TERMINAL_OUTPUT_DIR}/*; do`,
		'[ -f "$file" ] || continue',
		"filename=${file##*/}",
		'bytes=$(wc -c < "$file" | tr -d " ")',
		'printf "%s\\t%s\\n" "$filename" "$bytes"',
		"done | sort",
		"fi",
	].join("\n");
	return `sh -lc ${shellSingleQuote({ value: script })}`;
}

async function createSandboxDirectoryArchive({
	sandbox,
	path,
}: {
	sandbox: DaytonaSandbox;
	path: string;
}): Promise<string> {
	const script = [
		"set -eu",
		`src=${shellSingleQuote({ value: path })}`,
		'if [ ! -d "$src" ]; then',
		'  printf "not_directory\\n" >&2',
		"  exit 66",
		"fi",
		"archive=$(mktemp /tmp/qcut-folder-download.XXXXXX)",
		'mv "$archive" "$archive.tar.gz"',
		'archive="$archive.tar.gz"',
		'parent=$(dirname "$src")',
		'base=$(basename "$src")',
		'tar -C "$parent" -czf "$archive" "$base"',
		'printf "%s\\n" "$archive"',
	].join("\n");
	const result = await sandbox.process.executeCommand(
		`sh -lc ${shellSingleQuote({ value: script })}`,
		"/tmp",
		undefined,
		10 * 60
	);
	const exitCode = Number(result.exitCode);
	if (Number.isFinite(exitCode) && exitCode !== 0) {
		if (exitCode === 66) {
			throw new Error("session_file_path_not_directory");
		}
		throw new Error("session_file_directory_archive_failed");
	}
	const archivePath =
		typeof result.result === "string"
			? result.result.trim().split("\n").pop()
			: "";
	const normalizedArchivePath = normalizeSandboxPath({ value: archivePath });
	if (!normalizedArchivePath || !normalizedArchivePath.startsWith("/tmp/")) {
		throw new Error("session_file_directory_archive_invalid");
	}
	return normalizedArchivePath;
}
