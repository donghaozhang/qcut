import { describe, it, expect } from "vitest";
import { manifest, create } from "../index.js";

describe("runtime-acp manifest", () => {
	it("has correct slot and name", () => {
		expect(manifest.name).toBe("acp");
		expect(manifest.slot).toBe("runtime");
	});
});

describe("runtime-acp create()", () => {
	it("returns a runtime with all required methods", () => {
		const runtime = create();
		expect(runtime.name).toBe("acp");
		expect(typeof runtime.create).toBe("function");
		expect(typeof runtime.destroy).toBe("function");
		expect(typeof runtime.sendMessage).toBe("function");
		expect(typeof runtime.getOutput).toBe("function");
		expect(typeof runtime.isAlive).toBe("function");
		expect(typeof runtime.getMetrics).toBe("function");
		expect(typeof runtime.getAttachInfo).toBe("function");
	});
});

describe("runtime-acp session validation", () => {
	it("rejects invalid session IDs", async () => {
		const runtime = create();
		await expect(
			runtime.create({
				sessionId: "bad session!",
				workspacePath: "/tmp",
				launchCommand: "echo hello",
				environment: {},
			})
		).rejects.toThrow("Invalid session ID");
	});

	it("rejects empty launch command", async () => {
		const runtime = create();
		await expect(
			runtime.create({
				sessionId: "test-1",
				workspacePath: "/tmp",
				launchCommand: "",
				environment: {},
			})
		).rejects.toThrow("Empty launch command");
	});
});

describe("runtime-acp isAlive", () => {
	it("returns false for unknown handle", async () => {
		const runtime = create();
		const result = await runtime.isAlive({
			id: "nonexistent",
			runtimeName: "acp",
			data: {},
		});
		expect(result).toBe(false);
	});
});

describe("runtime-acp getOutput", () => {
	it("returns empty string for unknown handle", async () => {
		const runtime = create();
		const result = await runtime.getOutput({
			id: "nonexistent",
			runtimeName: "acp",
			data: {},
		});
		expect(result).toBe("");
	});
});

describe("runtime-acp destroy", () => {
	it("does not throw for unknown handle", async () => {
		const runtime = create();
		await expect(
			runtime.destroy({
				id: "nonexistent",
				runtimeName: "acp",
				data: {},
			})
		).resolves.toBeUndefined();
	});
});

describe("runtime-acp getMetrics", () => {
	it("returns metrics for unknown handle (fallback)", async () => {
		const runtime = create();
		const metrics = await runtime.getMetrics!({
			id: "nonexistent",
			runtimeName: "acp",
			data: {},
		});
		expect(metrics.uptimeMs).toBeGreaterThanOrEqual(0);
	});
});

describe("runtime-acp getAttachInfo", () => {
	it("returns not-running info for unknown handle", async () => {
		const runtime = create();
		const info = await runtime.getAttachInfo!({
			id: "test-1",
			runtimeName: "acp",
			data: {},
		});
		expect(info.type).toBe("process");
		expect(info.command).toContain("no longer running");
	});
});
