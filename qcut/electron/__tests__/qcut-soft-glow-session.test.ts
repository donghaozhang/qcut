// @vitest-environment node
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { createSoftGlowSession } from "../qcut-independent-filter/soft-glow-session.js";
import { resolveSoftGlowHost } from "../qcut-independent-filter/soft-glow-bridge.js";
import {
	SOFT_GLOW_RESOURCE,
	SOFT_GLOW_VERSION,
} from "../qcut-independent-filter/soft-glow-contract.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("../qcut-independent-filter/soft-glow-bridge.js", () => ({
	resolveSoftGlowHost: vi.fn(async () => "/owned/soft-glow"),
}));

const frame = {
	resourceId: SOFT_GLOW_RESOURCE,
	version: SOFT_GLOW_VERSION,
	width: 1,
	height: 1,
	intensity: 37,
	rgba: new Uint8Array([10, 20, 30, 255]),
};
const options = {
	width: 1,
	height: 1,
	intensity: 37,
	lut: new Uint8Array(512 * 512 * 4),
};
let mode: "echo" | "hold" | "short" | "excess";
let writes: Buffer[];
let child: ReturnType<typeof fakeHost>;
function fakeHost() {
	const host = new EventEmitter();
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const stdin = new Writable({
		write(chunk: Buffer, _encoding, callback) {
			writes.push(Buffer.from(chunk));
			callback();
			queueMicrotask(() => {
				if (mode === "echo") {
					stdout.write(chunk.subarray(0, 1));
					stdout.write(chunk.subarray(1));
				}
				if (mode === "short") {
					stdout.write(chunk.subarray(0, 2));
					stderr.write("truncated helper");
					host.emit("close", 2);
				}
				if (mode === "excess")
					stdout.write(Buffer.concat([chunk, Buffer.from([0])]));
			});
		},
	});
	return Object.assign(host, {
		stdout,
		stderr,
		stdin,
		kill: vi.fn(() => {
			queueMicrotask(() => host.emit("close", null));
			return true;
		}),
	});
}
beforeEach(() => {
	vi.clearAllMocks();
	mode = "echo";
	writes = [];
	vi.mocked(spawn).mockImplementation(() => {
		child = fakeHost();
		return child as unknown as ReturnType<typeof spawn>;
	});
});
describe("owned soft glow raw stream session", () => {
	it("rejects cancellation delivered with the final output chunk", async () => {
		const controller = new AbortController();
		const session = await createSoftGlowSession({
			...options,
			signal: controller.signal,
		});
		child.stdout.on("data", (chunk: Buffer) => {
			if (chunk.length === 3) controller.abort();
		});
		await expect(session.render(frame)).rejects.toThrow("cancelled");
		await session.dispose();
	});
	it.each([
		"stdout",
		"stderr",
		"stdin",
	] as const)("rejects %s pipe errors and makes the stream unusable", async (pipe) => {
		mode = "hold";
		const session = await createSoftGlowSession(options);
		const result = session.render(frame);
		await new Promise<void>((resolve) => setImmediate(resolve));
		child[pipe].emit("error", new Error("pipe failed"));
		await expect(result).rejects.toThrow("pipe failed");
		await expect(session.render(frame)).rejects.toThrow("pipe failed");
		await session.dispose();
	});
	it("bounds queued frames and kills a stalled helper on timeout", async () => {
		mode = "hold";
		const session = await createSoftGlowSession(options);
		vi.useFakeTimers();
		try {
			const pending = Array.from({ length: 4 }, () => session.render(frame));
			const results = Promise.allSettled(pending);
			await expect(session.render(frame)).rejects.toThrow("queue is full");
			await vi.advanceTimersByTimeAsync(60_001);
			expect(
				(await results).every((result) => result.status === "rejected")
			).toBe(true);
			expect(child.kill).toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
			await session.dispose();
		}
	});
	it("reuses one host, assembles partial reads, snapshots queued frames, and cleans its private LUT", async () => {
		const session = await createSoftGlowSession(options);
		const request = { ...frame, rgba: new Uint8Array(frame.rgba) };
		const first = session.render(request);
		request.rgba[0] = 250;
		const second = session.render({ ...frame, timestampSeconds: 0.5 });
		expect((await first).rgba).toEqual(frame.rgba);
		expect((await second).provider).toBe("qcut-cpu-soft-glow-ui-snapshot-v1");
		expect(spawn).toHaveBeenCalledTimes(1);
		expect(writes).toHaveLength(2);
		const args = vi.mocked(spawn).mock.calls[0][1] as string[];
		expect(args.slice(2)).toEqual([
			"--width",
			"1",
			"--height",
			"1",
			"--intensity",
			"0.37",
			"--intensity-mode",
			"ui-snapshot",
		]);
		expect((await readFile(args[1])).length).toBe(512 * 512 * 4);
		await session.dispose();
		await session.dispose();
		expect(child.kill).toHaveBeenCalledTimes(1);
		await expect(readFile(args[1])).rejects.toThrow();
		await expect(session.render(frame)).rejects.toThrow("disposed");
	});
	it.each([
		"short",
		"excess",
	] as const)("rejects %s output without returning a partial or substituted frame", async (selected) => {
		mode = selected;
		const session = await createSoftGlowSession(options);
		await expect(session.render(frame)).rejects.toThrow();
		await expect(session.render(frame)).rejects.toThrow();
		await session.dispose();
	});
	it("cancels an active read and all queued work", async () => {
		mode = "hold";
		const controller = new AbortController();
		const session = await createSoftGlowSession({
			...options,
			signal: controller.signal,
		});
		const results = Promise.allSettled([
			session.render(frame),
			session.render(frame),
		]);
		await new Promise<void>((resolve) => setImmediate(resolve));
		controller.abort();
		expect(
			(await results).every((result) => result.status === "rejected")
		).toBe(true);
		await session.dispose();
	});
	it("rejects malformed frames and mismatched fixed parameters before writing", async () => {
		const session = await createSoftGlowSession(options);
		for (const change of [
			{ version: "0".repeat(32) },
			{ intensity: 50 },
			{ width: 2, rgba: new Uint8Array(8).fill(255) },
			{ rgba: new Uint8Array([1, 2, 3, 254]) },
			{ intensity: Number.NaN },
		])
			await expect(session.render({ ...frame, ...change })).rejects.toThrow();
		expect(writes).toHaveLength(0);
		await session.dispose();
	});
	it("rejects dimensions, intensity, LUT length, and pre-cancellation before spawning", async () => {
		for (const change of [
			{ width: 0 },
			{ height: Infinity },
			{ width: 4096, height: 4096 },
			{ intensity: -1 },
			{ intensity: Infinity },
			{ lut: new Uint8Array(4) },
		])
			await expect(
				createSoftGlowSession({ ...options, ...change })
			).rejects.toThrow();
		await expect(
			createSoftGlowSession({ ...options, signal: AbortSignal.abort() })
		).rejects.toThrow();
		expect(spawn).not.toHaveBeenCalled();
	});
	it("cleans up and reports host startup failure", async () => {
		const session = await createSoftGlowSession(options);
		child.emit("error", new Error("host unavailable"));
		await expect(session.render(frame)).rejects.toThrow("host unavailable");
		await session.dispose();
		expect(resolveSoftGlowHost).toHaveBeenCalled();
	});
});
