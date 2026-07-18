/**
 * Cloud key sync — push/pull API keys between `~/.qcut/.env` and the
 * license server's per-user vault (`/api/keys`, `agent_secrets` table).
 *
 * `system sync-keys` pulls by default (cloud fills missing local keys);
 * `--force` lets the cloud overwrite differing local values; `--push`
 * uploads the locally configured keys instead. `system login` also runs
 * a best-effort pull so a fresh machine is ready right after sign-in.
 *
 * @module electron/native-pipeline/cli/cli-handlers-keys-sync
 */

import { KEY_NAMES, getKey, setKey } from "../infra/key-manager.js";
import { getLicenseServerUrl } from "../infra/proxy-client.js";
import type { CLIResult, CLIRunOptions } from "./cli-runner/types.js";

/** The session token authenticates the sync; it must never be synced. */
const SYNC_EXCLUDED_KEYS = new Set(["QCUT_AUTH_TOKEN"]);
const REQUEST_TIMEOUT_MS = 15_000;

export interface KeySyncDeps {
	fetchFn?: typeof fetch;
	readKey?: (name: string) => string | undefined;
	writeKey?: (name: string, value: string) => void;
}

export interface PullResult {
	added: string[];
	overwritten: string[];
	skipped: string[];
}

function resolveDeps(deps: KeySyncDeps): Required<KeySyncDeps> {
	return {
		fetchFn: deps.fetchFn ?? fetch,
		readKey: deps.readKey ?? getKey,
		writeKey: deps.writeKey ?? setKey,
	};
}

function authToken(readKey: (name: string) => string | undefined): string {
	const token = readKey("QCUT_AUTH_TOKEN");
	if (!token) {
		throw new Error(
			"Not logged in — run: qcut-pipeline system login --email you@example.com"
		);
	}
	return token;
}

async function readErrorMessage(
	response: Response,
	fallback: string
): Promise<string> {
	const body = (await response.json().catch(() => null)) as Record<
		string,
		unknown
	> | null;
	return (body?.error as string) || `${fallback} (HTTP ${response.status})`;
}

/**
 * Fetch the account's cloud keys and write them into the local store.
 * Local values win unless `overwrite` is set; the pull never deletes.
 */
export async function pullCloudKeys(
	{ overwrite }: { overwrite: boolean },
	deps: KeySyncDeps = {}
): Promise<PullResult> {
	const { fetchFn, readKey, writeKey } = resolveDeps(deps);
	const token = authToken(readKey);

	const response = await fetchFn(`${getLicenseServerUrl()}/api/keys/values`, {
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(await readErrorMessage(response, "Failed to fetch keys"));
	}

	const body = (await response.json()) as { keys?: Record<string, string> };
	const result: PullResult = { added: [], overwritten: [], skipped: [] };
	for (const [name, value] of Object.entries(body.keys ?? {})) {
		if (SYNC_EXCLUDED_KEYS.has(name) || typeof value !== "string" || !value) {
			continue;
		}
		const local = readKey(name);
		if (!local) {
			writeKey(name, value);
			result.added.push(name);
		} else if (overwrite && local !== value) {
			writeKey(name, value);
			result.overwritten.push(name);
		} else {
			result.skipped.push(name);
		}
	}
	return result;
}

/** Upload every locally configured known key to the cloud vault. */
async function pushLocalKeys(deps: KeySyncDeps = {}): Promise<string[]> {
	const { fetchFn, readKey } = resolveDeps(deps);
	const token = authToken(readKey);

	const keys: Record<string, string> = {};
	for (const name of KEY_NAMES) {
		if (SYNC_EXCLUDED_KEYS.has(name)) continue;
		const value = readKey(name);
		if (value) keys[name] = value;
	}
	if (Object.keys(keys).length === 0) {
		throw new Error("No local keys configured — nothing to push");
	}

	const response = await fetchFn(`${getLicenseServerUrl()}/api/keys`, {
		method: "PUT",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ keys }),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(await readErrorMessage(response, "Failed to push keys"));
	}
	return Object.keys(keys).sort();
}

/** CLI handler for `system sync-keys` (`--push` / `--pull` / `--force`). */
export async function handleSyncKeys(
	options: CLIRunOptions,
	deps: KeySyncDeps = {}
): Promise<CLIResult> {
	if (options.push && options.pull) {
		return { success: false, error: "Use either --push or --pull, not both" };
	}

	try {
		if (options.push) {
			const pushed = await pushLocalKeys(deps);
			return {
				success: true,
				data: {
					direction: "push",
					pushed,
					message: `Pushed ${pushed.length} key(s) to the cloud vault`,
				},
			};
		}

		const pulled = await pullCloudKeys(
			{ overwrite: options.force ?? false },
			deps
		);
		return {
			success: true,
			data: {
				direction: "pull",
				...pulled,
				message:
					`Added ${pulled.added.length}, overwrote ` +
					`${pulled.overwritten.length}, kept ${pulled.skipped.length} local key(s)`,
			},
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
