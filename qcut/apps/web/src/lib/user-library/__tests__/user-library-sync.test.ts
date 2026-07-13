import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserLibraryAdapter } from "../user-library-adapters";
import {
	USER_LIBRARY_ENVELOPE_VERSION,
	type UserLibraryEnvelope,
	type UserLibraryItem,
} from "../user-library-contract";

vi.mock("../user-library-client", () => {
	class UserLibraryConflictError extends Error {
		readonly current: unknown;

		constructor({ current }: { current: unknown }) {
			super("conflict");
			this.current = current;
		}
	}
	return {
		fetchUserLibraryDocument: vi.fn(),
		putUserLibraryDocument: vi.fn(),
		UserLibraryConflictError,
	};
});

const client = await import("../user-library-client");
const { syncUserLibraryAdapter } = await import("../user-library-sync");

function envelope({
	items,
	timestamp,
}: {
	items: UserLibraryItem[];
	timestamp: number;
}): UserLibraryEnvelope {
	return {
		schemaVersion: USER_LIBRARY_ENVELOPE_VERSION,
		items,
		itemUpdatedAt: Object.fromEntries(
			items.map((item) => [item.id, timestamp])
		),
		tombstones: {},
		updatedAt: timestamp,
	};
}

function document({
	payload,
	version,
}: {
	payload: UserLibraryEnvelope;
	version: number;
}) {
	return {
		documentKey: "default",
		namespace: "color-presets" as const,
		payload,
		updatedAt: "2026-07-13T00:00:00.000Z",
		version,
	};
}

function adapter({
	items,
	onPersist,
}: {
	items: UserLibraryItem[];
	onPersist: ({ items }: { items: UserLibraryItem[] }) => void;
}): UserLibraryAdapter {
	return {
		documentKey: "default",
		load: () => items,
		namespace: "color-presets",
		persist: onPersist,
	};
}

describe("user library synchronization", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});

	it("creates a cloud document from a local library", async () => {
		const local = [{ id: "local", name: "Local preset" }];
		const persisted: UserLibraryItem[][] = [];
		vi.mocked(client.fetchUserLibraryDocument).mockResolvedValue(null);
		vi.mocked(client.putUserLibraryDocument).mockImplementation(
			async ({ payload }) =>
				document({ payload: payload as UserLibraryEnvelope, version: 1 })
		);

		await syncUserLibraryAdapter({
			adapter: adapter({
				items: local,
				onPersist: ({ items }) => persisted.push(items),
			}),
			sessionToken: "session-token",
			now: 100,
		});

		expect(persisted.at(-1)).toEqual(local);
		expect(client.putUserLibraryDocument).toHaveBeenCalledWith(
			expect.objectContaining({ baseVersion: 0, sessionToken: "session-token" })
		);
	});

	it("merges an authoritative conflict and retries its version", async () => {
		const firstRemote = envelope({
			items: [{ id: "remote", name: "Remote preset" }],
			timestamp: 10,
		});
		const concurrentRemote = envelope({
			items: [
				{ id: "remote", name: "Remote preset" },
				{ id: "concurrent", name: "Concurrent preset" },
			],
			timestamp: 20,
		});
		vi.mocked(client.fetchUserLibraryDocument).mockResolvedValue(
			document({ payload: firstRemote, version: 1 })
		);
		vi.mocked(client.putUserLibraryDocument)
			.mockRejectedValueOnce(
				new client.UserLibraryConflictError({
					current: document({ payload: concurrentRemote, version: 2 }),
				})
			)
			.mockImplementationOnce(async ({ payload }) =>
				document({ payload: payload as UserLibraryEnvelope, version: 3 })
			);

		await syncUserLibraryAdapter({
			adapter: adapter({
				items: [{ id: "local", name: "Local preset" }],
				onPersist: () => undefined,
			}),
			sessionToken: "session-token",
			now: 30,
		});

		const retry = vi.mocked(client.putUserLibraryDocument).mock.calls[1]?.[0];
		expect(retry?.baseVersion).toBe(2);
		expect(
			(retry?.payload as UserLibraryEnvelope).items.map((item) => item.id)
		).toEqual(["concurrent", "local", "remote"]);
	});
});
