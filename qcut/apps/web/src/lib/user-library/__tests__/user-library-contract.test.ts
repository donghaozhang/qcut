import { describe, expect, it } from "vitest";
import {
	mergeUserLibraryEnvelopes,
	parseUserLibraryEnvelope,
	reconcileLocalUserLibrary,
	USER_LIBRARY_ENVELOPE_VERSION,
	type UserLibraryEnvelope,
	type UserLibraryItem,
} from "../user-library-contract";

function item({ id, name }: { id: string; name: string }): UserLibraryItem {
	return { id, name };
}

function envelope({
	items,
	itemUpdatedAt,
	tombstones = {},
}: {
	items: UserLibraryItem[];
	itemUpdatedAt: Record<string, number>;
	tombstones?: Record<string, number>;
}): UserLibraryEnvelope {
	return {
		schemaVersion: USER_LIBRARY_ENVELOPE_VERSION,
		items,
		itemUpdatedAt,
		tombstones,
		updatedAt: Math.max(
			0,
			...Object.values(itemUpdatedAt),
			...Object.values(tombstones)
		),
	};
}

describe("user library merge contract", () => {
	it("keeps concurrent additions from both devices", () => {
		const merged = mergeUserLibraryEnvelopes({
			local: envelope({
				items: [item({ id: "local", name: "Local" })],
				itemUpdatedAt: { local: 10 },
			}),
			remote: envelope({
				items: [item({ id: "remote", name: "Remote" })],
				itemUpdatedAt: { remote: 12 },
			}),
		});

		expect(merged.items.map((value) => value.id)).toEqual(["local", "remote"]);
	});

	it("uses the newest update for the same id", () => {
		const merged = mergeUserLibraryEnvelopes({
			local: envelope({
				items: [item({ id: "grade", name: "Old" })],
				itemUpdatedAt: { grade: 10 },
			}),
			remote: envelope({
				items: [item({ id: "grade", name: "New" })],
				itemUpdatedAt: { grade: 20 },
			}),
		});

		expect(merged.items).toEqual([item({ id: "grade", name: "New" })]);
	});

	it("lets a deletion tombstone defeat stale offline data", () => {
		const merged = mergeUserLibraryEnvelopes({
			local: envelope({
				items: [],
				itemUpdatedAt: {},
				tombstones: { obsolete: 30 },
			}),
			remote: envelope({
				items: [item({ id: "obsolete", name: "Stale" })],
				itemUpdatedAt: { obsolete: 20 },
			}),
		});

		expect(merged.items).toEqual([]);
		expect(merged.tombstones).toEqual({ obsolete: 30 });
	});

	it("resolves equal timestamps deterministically", () => {
		const left = envelope({
			items: [item({ id: "same", name: "Alpha" })],
			itemUpdatedAt: { same: 50 },
		});
		const right = envelope({
			items: [item({ id: "same", name: "Zulu" })],
			itemUpdatedAt: { same: 50 },
		});

		expect(
			mergeUserLibraryEnvelopes({ local: left, remote: right }).items
		).toEqual(mergeUserLibraryEnvelopes({ local: right, remote: left }).items);
	});

	it("tracks edits and removals against the last synchronized snapshot", () => {
		const previous = envelope({
			items: [
				item({ id: "kept", name: "Kept" }),
				item({ id: "removed", name: "Removed" }),
			],
			itemUpdatedAt: { kept: 10, removed: 10 },
		});
		const reconciled = reconcileLocalUserLibrary({
			items: [item({ id: "kept", name: "Changed" })],
			previous,
			remote: null,
			now: 100,
		});

		expect(reconciled.itemUpdatedAt).toEqual({ kept: 100 });
		expect(reconciled.tombstones).toEqual({ removed: 100 });
	});

	it("rejects malformed envelopes before they reach adapters", () => {
		expect(
			parseUserLibraryEnvelope({
				value: {
					schemaVersion: 1,
					items: [{ id: "preset" }],
					itemUpdatedAt: {},
					tombstones: {},
					updatedAt: 1,
				},
			})
		).toBeNull();
	});
});
