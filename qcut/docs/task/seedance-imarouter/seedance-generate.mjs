#!/usr/bin/env node
// Seedance video generation via IMA Router.
// Spec: https://doc.imarouter.com/#en/tag/seedance/POST/v1/videos
// Asset upload (Portrait): https://doc.imarouter.com/#en/tag/portrait
// Run: node seedance-generate.mjs --prompt "..." [flags]

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(homedir(), ".qcut", ".env");

async function loadDotEnv(path) {
	try {
		const text = await readFile(path, "utf8");
		for (const line of text.split("\n")) {
			const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
			if (!m) continue;
			const k = m[1].toUpperCase();
			const v = m[2].trim().replace(/^['"]|['"]$/g, "");
			if (process.env[k] === undefined) process.env[k] = v;
		}
	} catch {
		// no .env — fall back to process env
	}
}
await loadDotEnv(ENV_PATH);

async function upsertDotEnv(updates) {
	await mkdir(dirname(ENV_PATH), { recursive: true });
	let text = "";
	try { text = await readFile(ENV_PATH, "utf8"); } catch { /* fresh file */ }
	const lines = text.split("\n");
	const seen = new Set();
	const out = lines.map((line) => {
		const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=/i);
		if (!m) return line;
		const k = m[1].toUpperCase();
		if (Object.hasOwn(updates, k)) {
			seen.add(k);
			return `${k}=${updates[k]}`;
		}
		return line;
	});
	for (const [k, v] of Object.entries(updates)) {
		if (!seen.has(k)) out.push(`${k}=${v}`);
	}
	const final = out.join("\n").replace(/\n+$/, "") + "\n";
	await writeFile(ENV_PATH, final);
}

const BASE_URL = process.env.IMAROUTER_BASE_URL ?? "https://api.imarouter.com";
const API_KEY = process.env.IMAROUTER_API_KEY;

// Channel mapping per spec — DO NOT mix domestic/overseas.
const CHANNEL = {
	"seedance-2.0":         { region: "overseas", uploadModel: "seedance-upload",   envKey: "IMAROUTER_GROUP_ID_OVERSEAS" },
	"seedance-2.0-fast":    { region: "overseas", uploadModel: "seedance-upload",   envKey: "IMAROUTER_GROUP_ID_OVERSEAS" },
	"seedance-2.0-cn":      { region: "cn",       uploadModel: "ima-pro-upload-cn", envKey: "IMAROUTER_GROUP_ID_CN" },
	"seedance-2.0-fast-cn": { region: "cn",       uploadModel: "ima-pro-upload-cn", envKey: "IMAROUTER_GROUP_ID_CN" },
};

function parseArgs(argv) {
	const args = {
		model: "seedance-2.0-fast",
		duration: 5,
		resolution: "720p",
		roleMode: "reference",
		audio: false,
		images: [],
		uploads: [],
		refVideos: [],
		refAudios: [],
		pollInterval: 5,
		timeout: 600,
		assetTimeout: 120,
		submitOnly: false,
		groupName: "seedance-cli",
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		// Read the next argv slot as the value for a value-taking flag.
		// Errors out with a clear message instead of letting `undefined` /
		// `NaN` propagate into payload assembly or HTTP calls.
		const requireValue = () => {
			const v = argv[++i];
			if (v === undefined) {
				console.error(`Missing value for ${a}`);
				process.exit(1);
			}
			return v;
		};
		const requireNumber = () => {
			const raw = requireValue();
			const n = Number(raw);
			if (!Number.isFinite(n)) {
				console.error(`Invalid number for ${a}: ${raw}`);
				process.exit(1);
			}
			return n;
		};
		switch (a) {
			case "--prompt": args.prompt = requireValue(); break;
			case "--model": args.model = requireValue(); break;
			case "--duration": args.duration = requireNumber(); break;
			case "--resolution": args.resolution = requireValue(); break;
			case "--aspect-ratio": args.aspectRatio = requireValue(); break;
			case "--size": args.size = requireValue(); break;
			case "--image": args.images.push(requireValue()); break;
			case "--upload": args.uploads.push(requireValue()); break;
			case "--ref-video": args.refVideos.push(requireValue()); break;
			case "--ref-audio": args.refAudios.push(requireValue()); break;
			case "--role-mode": args.roleMode = requireValue(); break;
			case "--audio": args.audio = true; break;
			case "--out": args.out = requireValue(); break;
			case "--submit-only": args.submitOnly = true; break;
			case "--task-id": args.taskId = requireValue(); break;
			case "--poll-interval": args.pollInterval = requireNumber(); break;
			case "--timeout": args.timeout = requireNumber(); break;
			case "--asset-timeout": args.assetTimeout = requireNumber(); break;
			case "--group-name": args.groupName = requireValue(); break;
			case "--reset-group": args.resetGroup = true; break;
			case "-h":
			case "--help": args.help = true; break;
			default:
				console.error(`Unknown flag: ${a}`);
				process.exit(1);
		}
	}
	return args;
}

function printHelp() {
	console.log(`Usage: node seedance-generate.mjs [flags]

Required env: IMAROUTER_API_KEY (in ~/.qcut/.env or process env)
See ./quickstart.md for the full flag list.`);
}

function buildPayload(args) {
	const metadata = {};
	if (args.resolution && !args.size) metadata.resolution = args.resolution;
	if (args.aspectRatio) metadata.aspect_ratio = args.aspectRatio;
	if (args.audio) metadata.audio = true;
	if (args.images.length > 0) metadata.role_mode = args.roleMode;
	if (args.refVideos.length > 0) metadata.reference_video_urls = args.refVideos;
	if (args.refAudios.length > 0) metadata.reference_audio_urls = args.refAudios;

	const body = {
		model: args.model,
		duration: args.duration,
	};
	if (args.prompt) body.prompt = args.prompt;
	if (args.images.length > 0) body.images = args.images;
	if (args.size) body.size = args.size;
	if (Object.keys(metadata).length > 0) body.metadata = metadata;
	return body;
}

async function apiFetch(path, init = {}) {
	const res = await fetch(`${BASE_URL}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${API_KEY}`,
			"Content-Type": "application/json",
			...(init.headers ?? {}),
		},
	});
	const text = await res.text();
	let json;
	try { json = JSON.parse(text); } catch { json = { raw: text }; }
	if (!res.ok) {
		const code = json.code ?? res.status;
		const msg = json.message ?? text;
		throw new Error(`[${code}] ${msg}`);
	}
	return json;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── Asset (Portrait) flow ─────────────────────────────────────────────────────

async function ensureGroup(channel, args) {
	if (!args.resetGroup) {
		const cached = process.env[channel.envKey];
		if (cached) {
			console.log(`  using cached group_id (${channel.envKey}): ${cached}`);
			return cached;
		}
	}
	console.log(`→ POST /v1/assets/group/create  (model=${channel.uploadModel})`);
	const res = await apiFetch("/v1/assets/group/create", {
		method: "POST",
		body: JSON.stringify({
			name: args.groupName,
			description: "Auto-created by seedance-generate.mjs",
			model: channel.uploadModel,
		}),
	});
	const groupId = res.data?.Id ?? res.data?.id;
	if (!groupId) throw new Error(`group create returned no id: ${JSON.stringify(res)}`);
	console.log(`✓ group: ${groupId}`);
	await upsertDotEnv({ [channel.envKey]: groupId });
	process.env[channel.envKey] = groupId;
	return groupId;
}

const TERMINAL_OK = /^(approved|succe|ready|active|done)/i;
const TERMINAL_FAIL = /^(reject|fail|error|deny)/i;

async function uploadAsset(url, channel, groupId, args) {
	console.log(`→ POST /v1/assets/create  ${url}`);
	const res = await apiFetch("/v1/assets/create", {
		method: "POST",
		body: JSON.stringify({
			group_id: groupId,
			url,
			asset_type: "Image",
			model: channel.uploadModel,
		}),
	});
	const id = res.data?.Id;
	if (!id) throw new Error(`asset create returned no id: ${JSON.stringify(res)}`);
	console.log(`  asset id: ${id} — polling for review`);
	const deadline = Date.now() + args.assetTimeout * 1000;
	let lastStatus;
	while (Date.now() < deadline) {
		const get = await apiFetch("/v1/assets/get", {
			method: "POST",
			body: JSON.stringify({ id }),
		});
		const status = get.data?.Status ?? "unknown";
		if (status !== lastStatus) {
			console.log(`  asset status: ${status}`);
			lastStatus = status;
		}
		if (TERMINAL_OK.test(status)) {
			console.log(`✓ asset approved: ${id}`);
			return `asset://${id}`;
		}
		if (TERMINAL_FAIL.test(status)) {
			throw Object.assign(new Error(`asset rejected (status=${status})`), {
				failed: true, payload: get,
			});
		}
		await sleep(2000);
	}
	throw Object.assign(new Error(`asset review timeout after ${args.assetTimeout}s`), {
		timedOut: true,
	});
}

// ── Video flow ────────────────────────────────────────────────────────────────

async function submit(args) {
	const payload = buildPayload(args);
	console.log("→ POST /v1/videos");
	console.log(JSON.stringify(payload, null, 2));
	const res = await apiFetch("/v1/videos", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	const id = res.task_id ?? res.id;
	// Fail fast — polling `/v1/videos/undefined` masks the real failure
	// shape (the API often returns `{ code, message }` on rejection).
	if (!id) {
		throw new Error(
			`submit returned no task id; raw response: ${JSON.stringify(res)}`,
		);
	}
	console.log(`✓ task submitted: ${id}`);
	return id;
}

async function poll(taskId, args) {
	const deadline = Date.now() + args.timeout * 1000;
	let lastProgress = -1;
	while (Date.now() < deadline) {
		const res = await apiFetch(`/v1/videos/${taskId}`);
		if (typeof res.progress === "number" && res.progress !== lastProgress) {
			console.log(`  status=${res.status} progress=${res.progress}%`);
			lastProgress = res.progress;
		}
		if (res.status === "completed") return res;
		if (res.status === "failed") {
			throw Object.assign(new Error("job failed"), { failed: true, payload: res });
		}
		await sleep(args.pollInterval * 1000);
	}
	const err = new Error(`timeout after ${args.timeout}s`);
	err.timedOut = true;
	throw err;
}

async function downloadTo(url, dest) {
	const res = await fetch(url);
	if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`);
	await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
	console.log(`✓ saved → ${dest}`);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) { printHelp(); return; }
	if (!API_KEY) {
		console.error("IMAROUTER_API_KEY is not set");
		process.exit(1);
	}
	if (!args.taskId && !args.prompt && args.images.length === 0 && args.uploads.length === 0) {
		console.error("Provide --prompt, --image, or --upload (or --task-id to poll an existing task)");
		process.exit(1);
	}

	if (args.uploads.length > 0) {
		const channel = CHANNEL[args.model];
		if (!channel) {
			console.error(`Unknown seedance model: ${args.model}`);
			process.exit(1);
		}
		const groupId = await ensureGroup(channel, args);
		for (const url of args.uploads) {
			const assetUrl = await uploadAsset(url, channel, groupId, args);
			args.images.push(assetUrl);
		}
	}

	let taskId = args.taskId;
	if (!taskId) {
		taskId = await submit(args);
		if (args.submitOnly) return;
	}

	const result = await poll(taskId, args);
	const url = result.results?.[0]?.url;
	if (!url) {
		console.error("completed, but no result URL in response:");
		console.error(JSON.stringify(result, null, 2));
		process.exit(1);
	}
	console.log(`✓ video URL: ${url}`);
	if (args.out) await downloadTo(url, args.out);
	await writeFile(
		args.out ? `${args.out}.json` : join(SCRIPT_DIR, "result.json"),
		JSON.stringify(result, null, 2),
	);
}

main().catch((err) => {
	console.error(`✗ ${err.message}`);
	if (err.failed) {
		console.error(JSON.stringify(err.payload, null, 2));
		process.exit(2);
	}
	if (err.timedOut) process.exit(3);
	process.exit(1);
});
