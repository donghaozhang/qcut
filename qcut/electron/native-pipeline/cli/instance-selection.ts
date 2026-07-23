import * as fs from "node:fs";
import * as path from "node:path";
import { readDaemonInfo } from "../../headless-recorder/lifecycle.js";
import { stateDir as resolveStateDir } from "../infra/xdg-paths.js";
import type { CLIRunOptions, CLIResult } from "./cli-runner/types.js";

const DEFAULT_INSTANCE_PORTS = [8765, 8878];
const INSTANCE_PROBE_TIMEOUT_MS = 600;

export interface QCutInstance {
	host: string;
	port: number;
	url: string;
	status: string;
	version?: string;
	appVersion?: string;
	apiVersion?: string;
	uptime?: number;
	selected: boolean;
}

export interface SelectedInstance {
	host: string;
	port: number;
	savedAt: string;
}

function selectionPath(stateDir?: string): string {
	return path.join(resolveStateDir(stateDir), "selected-instance.json");
}

function parsePort(value: unknown): number | undefined {
	if (typeof value !== "string" && typeof value !== "number") return undefined;
	const parsed = Number.parseInt(String(value), 10);
	return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535
		? parsed
		: undefined;
}

export function readSelectedInstance({
	stateDir,
}: {
	stateDir?: string;
} = {}): SelectedInstance | null {
	try {
		const parsed = JSON.parse(
			fs.readFileSync(selectionPath(stateDir), "utf8")
		) as Partial<SelectedInstance>;
		const port = parsePort(parsed.port);
		if (!port) return null;
		return {
			host:
				typeof parsed.host === "string" && parsed.host.trim()
					? parsed.host.trim()
					: "127.0.0.1",
			port,
			savedAt:
				typeof parsed.savedAt === "string"
					? parsed.savedAt
					: new Date(0).toISOString(),
		};
	} catch {
		return null;
	}
}

export function saveSelectedInstance({
	host,
	port,
	stateDir,
}: {
	host: string;
	port: number;
	stateDir?: string;
}): SelectedInstance {
	const selected: SelectedInstance = {
		host,
		port,
		savedAt: new Date().toISOString(),
	};
	const filePath = selectionPath(stateDir);
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(selected, null, 2), {
		encoding: "utf8",
		mode: 0o600,
	});
	return selected;
}

function candidatePorts({
	stateDir,
	extraPorts,
}: {
	stateDir?: string;
	extraPorts?: number[];
}): number[] {
	const selected = readSelectedInstance({ stateDir });
	const daemon = readDaemonInfo();
	const envPorts = [
		process.env.QCUT_API_PORT,
		...(process.env.QCUT_INSTANCE_PORTS?.split(",") ?? []),
	]
		.map(parsePort)
		.filter((port): port is number => port !== undefined);
	return [
		...new Set([
			...DEFAULT_INSTANCE_PORTS,
			...envPorts,
			...(extraPorts ?? []),
			...(selected ? [selected.port] : []),
			...(daemon ? [daemon.port] : []),
		]),
	].sort((left, right) => left - right);
}

async function probeInstance({
	host,
	port,
	selected,
	timeoutMs,
	fetchImpl,
}: {
	host: string;
	port: number;
	selected: boolean;
	timeoutMs: number;
	fetchImpl: typeof fetch;
}): Promise<QCutInstance | null> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	const url = `http://${host}:${port}`;
	try {
		const response = await fetchImpl(`${url}/api/claude/health`, {
			signal: controller.signal,
			headers: { Accept: "application/json" },
		});
		if (!response.ok) return null;
		const raw = (await response.json()) as Record<string, unknown>;
		const health =
			raw.success === true && typeof raw.data === "object" && raw.data !== null
				? (raw.data as Record<string, unknown>)
				: raw;
		return {
			host,
			port,
			url,
			status: typeof health.status === "string" ? health.status : "available",
			version: typeof health.version === "string" ? health.version : undefined,
			appVersion:
				typeof health.appVersion === "string" ? health.appVersion : undefined,
			apiVersion:
				typeof health.apiVersion === "string" ? health.apiVersion : undefined,
			uptime: typeof health.uptime === "number" ? health.uptime : undefined,
			selected,
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

export async function discoverQCutInstances({
	host = "127.0.0.1",
	stateDir,
	extraPorts,
	timeoutMs = INSTANCE_PROBE_TIMEOUT_MS,
	fetchImpl = globalThis.fetch,
}: {
	host?: string;
	stateDir?: string;
	extraPorts?: number[];
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
} = {}): Promise<QCutInstance[]> {
	const selected = readSelectedInstance({ stateDir });
	const instances = await Promise.all(
		candidatePorts({ stateDir, extraPorts }).map((port) =>
			probeInstance({
				host,
				port,
				selected: selected?.host === host && selected.port === port,
				timeoutMs,
				fetchImpl,
			})
		)
	);
	return instances.filter(
		(instance): instance is QCutInstance => instance !== null
	);
}

export async function resolveEditorInstance(
	options: CLIRunOptions
): Promise<{ host: string; port: string; source: string }> {
	const host = options.host ?? process.env.QCUT_API_HOST?.trim() ?? "127.0.0.1";
	const explicitPort = parsePort(options.port);
	if (options.port !== undefined && !explicitPort) {
		throw new Error(`Invalid QCut instance port: ${options.port}`);
	}
	if (explicitPort) {
		return { host, port: String(explicitPort), source: "--port" };
	}

	const envPort = parsePort(process.env.QCUT_API_PORT);
	if (envPort) {
		return { host, port: String(envPort), source: "QCUT_API_PORT" };
	}

	const selected = readSelectedInstance({ stateDir: options.stateDir });
	if (selected) {
		return {
			host: options.host ?? selected.host,
			port: String(selected.port),
			source: "instances use",
		};
	}

	const instances = await discoverQCutInstances({
		host,
		stateDir: options.stateDir,
	});
	if (instances.length > 1) {
		const choices = instances
			.map((instance) => `${instance.url} (${instance.appVersion ?? "QCut"})`)
			.join(", ");
		throw new Error(
			`Multiple QCut instances are running: ${choices}. Select one with "qcut instances use --port <port>" or pass --port for this command.`
		);
	}
	if (instances.length === 1) {
		return {
			host: instances[0].host,
			port: String(instances[0].port),
			source: "auto-discovery",
		};
	}

	return { host, port: "8765", source: "default" };
}

export async function handleInstancesCommand(
	options: CLIRunOptions
): Promise<CLIResult> {
	const action = options.command.replace(/^instances-/, "");
	const host = options.host ?? process.env.QCUT_API_HOST?.trim() ?? "127.0.0.1";
	if (action === "list") {
		const selected = readSelectedInstance({ stateDir: options.stateDir });
		const instances = await discoverQCutInstances({
			host,
			stateDir: options.stateDir,
		});
		return {
			success: true,
			data: {
				count: instances.length,
				selected,
				instances,
			},
		};
	}

	if (action === "use") {
		const port = parsePort(options.port);
		if (!port) {
			return {
				success: false,
				error: "Missing or invalid --port (expected 1-65535)",
			};
		}
		const instances = await discoverQCutInstances({
			host,
			stateDir: options.stateDir,
			extraPorts: [port],
		});
		const instance = instances.find(
			(candidate) => candidate.host === host && candidate.port === port
		);
		if (!instance && !options.force) {
			return {
				success: false,
				error: `No QCut instance responded at http://${host}:${port}. Start it first or add --force to remember the address anyway.`,
			};
		}
		const selected = saveSelectedInstance({
			host,
			port,
			stateDir: options.stateDir,
		});
		return {
			success: true,
			data: {
				selected,
				instance: instance ? { ...instance, selected: true } : null,
			},
		};
	}

	return {
		success: false,
		error: `Unknown instances action: ${action}. Available: list, use`,
	};
}
