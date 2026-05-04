#!/usr/bin/env node
// Seedance video generation via IMA Router.
// Spec: https://doc.imarouter.com/#en/tag/seedance/POST/v1/videos
// Run: node seedance-generate.mjs --prompt "..." [flags]

import { writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";

const BASE_URL = process.env.IMAROUTER_BASE_URL ?? "https://api.imarouter.com";
const API_KEY = process.env.IMAROUTER_API_KEY;

function parseArgs(argv) {
	const args = {
		model: "seedance-2.0-fast",
		duration: 5,
		resolution: "720p",
		roleMode: "reference",
		audio: false,
		images: [],
		refVideos: [],
		refAudios: [],
		pollInterval: 5,
		timeout: 600,
		submitOnly: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const next = () => argv[++i];
		switch (a) {
			case "--prompt": args.prompt = next(); break;
			case "--model": args.model = next(); break;
			case "--duration": args.duration = Number(next()); break;
			case "--resolution": args.resolution = next(); break;
			case "--aspect-ratio": args.aspectRatio = next(); break;
			case "--size": args.size = next(); break;
			case "--image": args.images.push(next()); break;
			case "--ref-video": args.refVideos.push(next()); break;
			case "--ref-audio": args.refAudios.push(next()); break;
			case "--role-mode": args.roleMode = next(); break;
			case "--audio": args.audio = true; break;
			case "--out": args.out = next(); break;
			case "--submit-only": args.submitOnly = true; break;
			case "--task-id": args.taskId = next(); break;
			case "--poll-interval": args.pollInterval = Number(next()); break;
			case "--timeout": args.timeout = Number(next()); break;
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

Required env: IMAROUTER_API_KEY
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

async function submit(args) {
	const payload = buildPayload(args);
	console.log("→ POST /v1/videos");
	console.log(JSON.stringify(payload, null, 2));
	const res = await apiFetch("/v1/videos", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	const id = res.task_id ?? res.id;
	console.log(`✓ task submitted: ${id}`);
	return id;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
	if (!args.taskId && !args.prompt && args.images.length === 0) {
		console.error("Provide --prompt or --image (or --task-id to poll an existing task)");
		process.exit(1);
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
		`${args.out ?? "result"}.json`,
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
