/**
 * IMA Router asset (portrait) upload flow.
 *
 * Some references — notably real-people / portrait photos — cannot go to
 * Seedance as inline `images: [url]` (the platform rejects them with
 * `Error 601400`). The canonical path is:
 *
 *   1. POST /v1/assets/group/create — once per channel, cache the group id
 *   2. POST /v1/assets/create        — submit the URL for pre-review
 *   3. POST /v1/assets/get           — poll until approved
 *   4. Submit the video job with `images: ["asset://{id}"]`
 *
 * Channel safety: overseas models (`seedance-2.0`, `seedance-2.0-fast`) must
 * use the `seedance-upload` model; CN models (`-cn`) must use
 * `ima-pro-upload-cn`. Mixing creates a usable `asset://...` that the
 * video job will reject. `channelFor()` returns the right pair so the
 * step executor can't get this wrong.
 *
 * @module electron/native-pipeline/infra/imarouter-assets
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { buildProviderUrl } from "./api-provider-urls.js";

export type ImaRouterRegion = "overseas" | "cn";

export interface ImaRouterChannel {
	region: ImaRouterRegion;
	/** The `model` field used in `/v1/assets/create`. */
	uploadModel: "seedance-upload" | "ima-pro-upload-cn";
	/** State key in `imarouter-state.json` that stores the cached group id. */
	groupIdKey: "groupIdOverseas" | "groupIdCn";
}

/**
 * Map a registry model key (or raw IMA Router model name) to its channel.
 * Accepts both forms because the executor passes the registry key but the
 * standalone script passes the API model name. Unknown inputs default to
 * overseas — IMA Router's overseas API is the public default.
 */
export function channelFor(modelKeyOrName: string): ImaRouterChannel {
	const isCn = /(_cn|-cn)(?:$|_)/.test(modelKeyOrName);
	if (isCn) {
		return {
			region: "cn",
			uploadModel: "ima-pro-upload-cn",
			groupIdKey: "groupIdCn",
		};
	}
	return {
		region: "overseas",
		uploadModel: "seedance-upload",
		groupIdKey: "groupIdOverseas",
	};
}

interface ImaRouterState {
	groupIdOverseas?: string;
	groupIdCn?: string;
}

function statePath(): string {
	return path.join(os.homedir(), ".qcut", "imarouter-state.json");
}

function readState(): ImaRouterState {
	try {
		const text = fs.readFileSync(statePath(), "utf-8");
		const parsed = JSON.parse(text) as ImaRouterState;
		return parsed ?? {};
	} catch {
		return {};
	}
}

function writeState(state: ImaRouterState): void {
	const p = statePath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

export function getCachedGroupId(
	channel: ImaRouterChannel
): string | undefined {
	return readState()[channel.groupIdKey];
}

export function setCachedGroupId(
	channel: ImaRouterChannel,
	groupId: string
): void {
	const state = readState();
	state[channel.groupIdKey] = groupId;
	writeState(state);
}

const TERMINAL_OK = /^(approved|succe|ready|active|done)/i;
const TERMINAL_FAIL = /^(reject|fail|error|deny)/i;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface AssetClientOptions {
	apiKey: string;
	fetchImpl?: FetchLike;
	signal?: AbortSignal;
}

interface CreateAssetGroupResponse {
	data?: { Id?: string; id?: string };
}

interface CreateAssetResponse {
	data?: { Id?: string };
}

interface GetAssetResponse {
	data?: {
		Id?: string;
		Status?: string;
		Reason?: string;
		reason?: string;
	};
}

async function imaPost<T>(
	endpoint: string,
	body: Record<string, unknown>,
	opts: AssetClientOptions
): Promise<T> {
	const f = opts.fetchImpl ?? fetch;
	const res = await f(buildProviderUrl("imarouter", endpoint), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${opts.apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
		signal: opts.signal,
	});
	const text = await res.text();
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		json = { raw: text };
	}
	if (!res.ok) {
		const obj = json as { code?: number | string; message?: string };
		throw new Error(
			`IMA Router ${endpoint} error ${res.status}${
				obj.code ? ` [${obj.code}]` : ""
			}: ${obj.message ?? text.slice(0, 200)}`
		);
	}
	return json as T;
}

export interface EnsureGroupOptions extends AssetClientOptions {
	/** Group name used when one has to be created. Defaults to `qcut-cli`. */
	name?: string;
	/** Force a fresh create even if a cached id is present. */
	reset?: boolean;
}

export async function ensureGroup(
	channel: ImaRouterChannel,
	opts: EnsureGroupOptions
): Promise<string> {
	if (!opts.reset) {
		const cached = getCachedGroupId(channel);
		if (cached) return cached;
	}
	const res = await imaPost<CreateAssetGroupResponse>(
		"v1/assets/group/create",
		{
			name: opts.name ?? "qcut-cli",
			description: "Auto-created by QCut native pipeline",
			model: channel.uploadModel,
		},
		opts
	);
	const groupId = res.data?.Id ?? res.data?.id;
	if (!groupId) {
		throw new Error(
			`IMA Router group create returned no id: ${JSON.stringify(res)}`
		);
	}
	setCachedGroupId(channel, groupId);
	return groupId;
}

export interface UploadAssetOptions extends AssetClientOptions {
	/** Maximum time to wait for the asset to clear review. Default 120 s. */
	timeoutMs?: number;
	/** Pause between status polls. Default 2 s. */
	pollIntervalMs?: number;
}

/**
 * Upload `url` to IMA Router's asset platform and wait for it to be
 * approved. Returns the `asset://{id}` reference the video API consumes.
 *
 * Throws on rejection (with the platform's reason) and on timeout.
 */
export async function uploadAsset(
	url: string,
	channel: ImaRouterChannel,
	groupId: string,
	opts: UploadAssetOptions
): Promise<string> {
	const create = await imaPost<CreateAssetResponse>(
		"v1/assets/create",
		{
			group_id: groupId,
			url,
			asset_type: "Image",
			model: channel.uploadModel,
		},
		opts
	);
	const assetId = create.data?.Id;
	if (!assetId) {
		throw new Error(
			`IMA Router asset create returned no id: ${JSON.stringify(create)}`
		);
	}

	const timeoutMs = opts.timeoutMs ?? 120_000;
	const pollIntervalMs = opts.pollIntervalMs ?? 2_000;
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		if (opts.signal?.aborted) throw new Error("Cancelled");
		const status = await imaPost<GetAssetResponse>(
			"v1/assets/get",
			{ id: assetId },
			opts
		);
		const s = status.data?.Status ?? "";
		if (TERMINAL_OK.test(s)) return `asset://${assetId}`;
		if (TERMINAL_FAIL.test(s)) {
			const reason = status.data?.Reason ?? status.data?.reason ?? s;
			throw new Error(
				`IMA Router asset rejected (status=${s}, reason=${reason})`
			);
		}
		await new Promise((r) => setTimeout(r, pollIntervalMs));
	}
	throw new Error(
		`IMA Router asset ${assetId} did not clear review within ${timeoutMs / 1000}s`
	);
}
