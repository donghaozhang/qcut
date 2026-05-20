import type { Context } from "hono";

import {
	CODEX_AGENT_COMMAND,
	MAX_AGENT_SOURCE_LENGTH,
	MAX_CODEX_PROMPT_LENGTH,
	MAX_COMMAND_LENGTH,
	SAFE_COMMAND_TOKEN,
} from "./constants";

export interface CreateAgentJobBody {
	command?: string;
	args?: Record<string, unknown>;
	sessionId?: string;
}

export function normalizeOptionalId({
	value,
}: {
	value: unknown;
}): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

export function normalizeTerminalArtifactFilename({
	value,
}: {
	value: unknown;
}): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	if (
		trimmed.length === 0 ||
		trimmed.length > 255 ||
		trimmed === "." ||
		trimmed === ".." ||
		trimmed.includes("/") ||
		trimmed.includes("\\") ||
		trimmed.includes("\0")
	) {
		return null;
	}
	return trimmed;
}

export function normalizeUploadedFilename({
	value,
}: {
	value: unknown;
}): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const base = value.split(/[\\/]/).pop() ?? "";
	const trimmed = base.trim();
	if (!normalizeTerminalArtifactFilename({ value: trimmed })) {
		return null;
	}
	return trimmed;
}

export function normalizeSandboxPath({
	value,
}: {
	value: unknown;
}): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	if (
		trimmed.length === 0 ||
		!trimmed.startsWith("/") ||
		trimmed.includes("\\") ||
		trimmed.includes("\0")
	) {
		return null;
	}
	const segments = trimmed.split("/").filter((segment) => segment.length > 0);
	if (segments.some((segment) => segment === "." || segment === "..")) {
		return null;
	}
	return `/${segments.join("/")}`;
}

export function getSandboxParentPath({
	path,
}: {
	path: string;
}): string | null {
	if (path === "/") {
		return null;
	}
	const segments = path.split("/").filter((segment) => segment.length > 0);
	if (segments.length <= 1) {
		return "/";
	}
	return `/${segments.slice(0, -1).join("/")}`;
}

export function getSandboxPathBasename({
	path,
}: {
	path: string;
}): string | null {
	const segments = path.split("/").filter((segment) => segment.length > 0);
	const basename = segments[segments.length - 1] || "";
	return normalizeTerminalArtifactFilename({ value: basename });
}

export function joinSandboxPath({
	dir,
	filename,
}: {
	dir: string;
	filename: string;
}): string {
	return dir === "/" ? `/${filename}` : `${dir}/${filename}`;
}

export function normalizeSessionFileFolder({
	value,
}: {
	value: unknown;
}): "input" | "output" | null {
	if (value === "input" || value === "output") {
		return value;
	}
	return null;
}

function isUploadFile(value: unknown): value is File {
	return Boolean(
		value &&
			typeof value === "object" &&
			typeof (value as File).name === "string" &&
			typeof (value as File).size === "number" &&
			typeof (value as File).arrayBuffer === "function"
	);
}

export function extractUploadFiles({
	body,
}: {
	body: Record<string, unknown>;
}): File[] {
	const values = [body.file, body.files].flat();
	return values.filter(isUploadFile);
}

export async function parseCreateAgentJobBody({
	c,
}: {
	c: Context;
}): Promise<CreateAgentJobBody> {
	try {
		const body = (await c.req.json()) as CreateAgentJobBody;
		return typeof body === "object" && body !== null ? body : {};
	} catch {
		return {};
	}
}

export function shellSingleQuote({ value }: { value: string }): string {
	return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

export function validateCommand({ command }: { command: string }): string {
	if (command.length === 0) {
		return "command_required";
	}
	if (command.length > MAX_COMMAND_LENGTH) {
		return "command_too_long";
	}
	if (!command.startsWith("qcut ") && command !== CODEX_AGENT_COMMAND) {
		return "command_must_start_with_qcut_or_codex_exec";
	}

	const tokens = command.split(/\s+/).filter(Boolean);
	for (const token of tokens) {
		if (!SAFE_COMMAND_TOKEN.test(token)) {
			return "command_contains_unsafe_token";
		}
	}

	return "";
}

export function validateAgentJobBody({
	command,
	args,
}: {
	command: string;
	args?: Record<string, unknown>;
}): string {
	const commandError = validateCommand({ command });
	if (commandError) {
		return commandError;
	}
	if (command !== CODEX_AGENT_COMMAND) {
		return "";
	}

	const prompt =
		args && typeof args.codexPrompt === "string" ? args.codexPrompt.trim() : "";
	if (prompt.length === 0) {
		return "codex_prompt_required";
	}
	if (prompt.length > MAX_CODEX_PROMPT_LENGTH) {
		return "codex_prompt_too_long";
	}
	return "";
}

export function getAgentJobSource({
	args,
}: {
	args?: Record<string, unknown>;
}): string {
	const source = args?.source;
	if (typeof source !== "string") {
		return "website_chat_agent";
	}
	const trimmed = source.trim();
	if (trimmed.length === 0) {
		return "website_chat_agent";
	}
	return trimmed.slice(0, MAX_AGENT_SOURCE_LENGTH);
}
