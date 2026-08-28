// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	emitJsonResult,
	jsonError,
	jsonOk,
	jsonPending,
} from "../json-output.js";

afterEach(() => vi.restoreAllMocks());

describe("CLI JSON stdout", () => {
	it("writes a complete large UTF-8 envelope to stdout, not console.log", () => {
		const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const cards = Array.from({ length: 2000 }, (_, index) => ({
			resourceId: String(index),
			title: "\u6ee4\u955c".repeat(40),
		}));
		emitJsonResult(
			"filter-lab-catalog",
			{ success: true, data: { count: cards.length, cards } },
			{ command_id: "test", duration_ms: 123 }
		);
		const raw = String(write.mock.calls[0]?.[0]);
		expect(Buffer.byteLength(raw)).toBeGreaterThan(500_000);
		expect(JSON.parse(raw)).toEqual({
			status: "ok",
			command_id: "test",
			duration_ms: 123,
			data: {
				schema_version: "1",
				command: "filter-lab-catalog",
				data: { count: cards.length, cards },
			},
		});
		expect(raw.endsWith("\n")).toBe(true);
		expect(log).not.toHaveBeenCalled();
	});

	it("keeps success, error, and pending wire formats unchanged", () => {
		const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
		jsonOk({ value: 1 });
		jsonError("failed", "render:failed", { partial: true }, "id", 10);
		jsonPending("job-1");
		expect(
			write.mock.calls.map(([value]) => JSON.parse(String(value)))
		).toEqual([
			{ status: "ok", data: { value: 1 } },
			{
				status: "error",
				error: "failed",
				code: "render:failed",
				data: { partial: true },
				command_id: "id",
				duration_ms: 10,
			},
			{ status: "pending", jobId: "job-1" },
		]);
	});

	it("writes partial failure data even when the stream applies backpressure", () => {
		const write = vi.spyOn(process.stdout, "write").mockReturnValue(false);
		emitJsonResult("filter-lab-render", {
			success: false,
			error: "failed",
			data: { rows: "x".repeat(500_000) },
		});
		expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
			status: "error",
			error: "failed",
			data: { data: { rows: "x".repeat(500_000) } },
		});
	});
});
