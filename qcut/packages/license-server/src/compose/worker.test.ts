import { describe, expect, it, vi } from "vitest";
import { runComposeWorkerOnce } from "./worker";
import type { ComposeCloudRow, composeJobStore } from "./job-store";

function fixture() {
	const row = {
		id: "job",
		lease_token: "lease",
		input: { snapshot: { id: "snapshot" }, intent: { kind: "full-compose" } },
	} as ComposeCloudRow;
	const store: typeof composeJobStore = {
		claim: vi.fn(async () => row),
		finish: vi.fn(async () => true),
		get: vi.fn(),
		create: vi.fn(),
		cancel: vi.fn(),
	};
	return { store, plan: vi.fn(async () => ({ operations: [] })) };
}
describe("Compose worker leases", () => {
	it("only publishes using its own lease and a bounded planning signal", async () => {
		const { store, plan } = fixture();
		expect(await runComposeWorkerOnce({ store, plan })).toEqual({
			id: "job",
			status: "completed",
		});
		expect(plan).toHaveBeenCalledWith(
			expect.objectContaining({ signal: expect.any(AbortSignal) })
		);
		expect(store.finish).toHaveBeenCalledWith({
			id: "job",
			leaseToken: "lease",
			result: { operations: [] },
		});
	});
	it("never overwrites a canceled or reclaimed job", async () => {
		const { store, plan } = fixture();
		vi.mocked(store.finish).mockResolvedValue(false);
		expect(await runComposeWorkerOnce({ store, plan })).toEqual({
			id: "job",
			status: "superseded",
		});
	});
	it("retains the lease on shutdown for another worker to recover", async () => {
		const { store } = fixture();
		const controller = new AbortController();
		const plan = vi.fn(async () => {
			controller.abort();
			throw new Error("interrupted");
		});
		await expect(
			runComposeWorkerOnce({ store, plan, signal: controller.signal })
		).rejects.toThrow();
		expect(store.finish).not.toHaveBeenCalled();
	});
	it("persists a generic failure without provider credentials", async () => {
		const { store } = fixture();
		const plan = vi.fn(async () => {
			throw new Error("provider-secret");
		});
		expect(await runComposeWorkerOnce({ store, plan })).toEqual({
			id: "job",
			status: "failed",
		});
		expect(store.finish).toHaveBeenCalledWith({
			id: "job",
			leaseToken: "lease",
			errorCode: "planning-failed",
		});
	});
	it("does no model work when the queue is empty", async () => {
		const { store, plan } = fixture();
		vi.mocked(store.claim).mockResolvedValue(undefined);
		expect(await runComposeWorkerOnce({ store, plan })).toBeNull();
		expect(plan).not.toHaveBeenCalled();
	});
});
