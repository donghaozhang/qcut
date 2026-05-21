import {
	agentArtifacts,
	agentEvents,
	agentJobs,
	agentSessions,
} from "@qcut/db/schema";

import { CONTENT_TYPE_BY_EXTENSION, TERMINAL_OUTPUT_DIR } from "./constants";

export function serializeDate({
	value,
}: {
	value: Date | string | null;
}): string | null {
	if (!value) {
		return null;
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	return value;
}

export function getArtifactFilename({
	artifact,
}: {
	artifact: typeof agentArtifacts.$inferSelect;
}): string {
	const meta = artifact.meta;
	if (
		meta &&
		typeof meta === "object" &&
		"filename" in meta &&
		typeof meta.filename === "string" &&
		meta.filename.trim().length > 0
	) {
		return meta.filename.trim();
	}
	const parts = artifact.storagePath.split("/");
	return parts[parts.length - 1] || "qcut-artifact";
}

export function escapeContentDispositionFilename({
	filename,
}: {
	filename: string;
}): string {
	return filename.replace(/["\r\n\\]/g, "_");
}

export function getArtifactContentType({
	artifact,
	blob,
}: {
	artifact: typeof agentArtifacts.$inferSelect;
	blob: Blob;
}): string {
	const filename = getArtifactFilename({ artifact }).toLowerCase();
	const dot = filename.lastIndexOf(".");
	if (dot >= 0) {
		const contentType = CONTENT_TYPE_BY_EXTENSION[filename.slice(dot)];
		if (contentType) {
			return contentType;
		}
	}
	if (blob.type.length > 0) {
		return blob.type;
	}
	return "application/octet-stream";
}

export function getContentTypeByFilename({
	filename,
}: {
	filename: string;
}): string {
	const normalized = filename.toLowerCase();
	const dot = normalized.lastIndexOf(".");
	if (dot >= 0) {
		return (
			CONTENT_TYPE_BY_EXTENSION[normalized.slice(dot)] ||
			"application/octet-stream"
		);
	}
	return "application/octet-stream";
}

export function serializeAgentJob(job: typeof agentJobs.$inferSelect) {
	return {
		id: job.id,
		userId: job.userId,
		sessionId: job.sessionId,
		status: job.status,
		command: job.command,
		args: job.args,
		createdAt: serializeDate({ value: job.createdAt }),
		claimedAt: serializeDate({ value: job.claimedAt }),
		finishedAt: serializeDate({ value: job.finishedAt }),
		exitCode: job.exitCode,
		error: job.error,
		runnerId: job.runnerId,
	};
}

export function serializeAgentSession(
	session: typeof agentSessions.$inferSelect
) {
	return {
		id: session.id,
		userId: session.userId,
		status: session.status,
		provider: session.provider,
		providerSessionId: session.providerSessionId,
		imageTag: session.imageTag,
		startedAt: serializeDate({ value: session.startedAt }),
		lastActiveAt: serializeDate({ value: session.lastActiveAt }),
		expiresAt: serializeDate({ value: session.expiresAt }),
		endedAt: serializeDate({ value: session.endedAt }),
		endReason: session.endReason,
		runnerId: session.runnerId,
	};
}

export function serializeAgentEvent(event: typeof agentEvents.$inferSelect) {
	return {
		id: event.id,
		jobId: event.jobId,
		userId: event.userId,
		kind: event.kind,
		payload: event.payload,
		createdAt: serializeDate({ value: event.createdAt }),
	};
}

export function serializeAgentArtifact(
	artifact: typeof agentArtifacts.$inferSelect
) {
	return {
		id: artifact.id,
		jobId: artifact.jobId,
		userId: artifact.userId,
		kind: artifact.kind,
		storagePath: artifact.storagePath,
		bytes: artifact.bytes,
		meta: artifact.meta,
		createdAt: serializeDate({ value: artifact.createdAt }),
	};
}

export function serializeTerminalArtifact({
	sessionId,
	artifact,
}: {
	sessionId: string;
	artifact: { filename: string; bytes: number };
}) {
	return {
		id: artifact.filename,
		sessionId,
		jobId: null,
		userId: null,
		kind: classifyArtifactKind({ filename: artifact.filename }),
		storagePath: `${TERMINAL_OUTPUT_DIR}/${artifact.filename}`,
		bytes: artifact.bytes,
		meta: { filename: artifact.filename, source: "terminal" },
		createdAt: null,
	};
}

export function serializeSessionFile({
	sessionId,
	file,
}: {
	sessionId: string;
	file: {
		filename: string;
		bytes: number;
		folder: "input" | "output";
		dir: string;
	};
}) {
	return {
		id: `${file.folder}/${file.filename}`,
		sessionId,
		jobId: null,
		userId: null,
		kind: classifyArtifactKind({ filename: file.filename }),
		storagePath: `${file.dir}/${file.filename}`,
		bytes: file.bytes,
		meta: {
			filename: file.filename,
			folder: file.folder,
			source: file.folder === "input" ? "upload" : "terminal",
		},
		createdAt: null,
	};
}

export function serializeSandboxFile({
	sessionId,
	file,
}: {
	sessionId: string;
	file: {
		filename: string;
		bytes: number;
		isDir: boolean;
		path: string;
		parentPath: string;
	};
}) {
	return {
		id: file.path,
		sessionId,
		jobId: null,
		userId: null,
		kind: file.isDir
			? "folder"
			: classifyArtifactKind({ filename: file.filename }),
		storagePath: file.path,
		bytes: file.isDir ? 0 : file.bytes,
		meta: {
			filename: file.filename,
			path: file.path,
			parentPath: file.parentPath,
			isDir: file.isDir,
			folder: "filesystem",
			source: "sandbox_fs",
		},
		createdAt: null,
	};
}

function classifyArtifactKind({
	filename,
}: {
	filename: string;
}): "image" | "video" | "audio" | "json" | "log" {
	const dot = filename.lastIndexOf(".");
	const ext = dot >= 0 ? filename.toLowerCase().slice(dot) : "";
	if ([".gif", ".jpeg", ".jpg", ".png", ".webp"].includes(ext)) {
		return "image";
	}
	if ([".mov", ".mp4", ".webm"].includes(ext)) {
		return "video";
	}
	if ([".m4a", ".mp3", ".ogg", ".wav"].includes(ext)) {
		return "audio";
	}
	if (ext === ".json") {
		return "json";
	}
	return "log";
}
