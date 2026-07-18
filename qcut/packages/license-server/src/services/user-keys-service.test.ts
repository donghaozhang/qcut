import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => {
	const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
	const values = vi.fn(() => ({ onConflictDoUpdate }));
	const insert = vi.fn(() => ({ values }));
	const transaction = vi.fn(
		async (callback: (tx: { insert: typeof insert }) => Promise<unknown>) =>
			callback({ insert })
	);
	return { insert, onConflictDoUpdate, transaction, values };
});

vi.mock("../db/drizzle", () => ({
	db: { transaction: database.transaction },
}));

import { upsertUserKeys } from "./user-keys-service";

describe("upsertUserKeys", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		database.onConflictDoUpdate.mockResolvedValue(undefined);
	});

	it("writes every key through one transaction", async () => {
		await expect(
			upsertUserKeys({
				userId: "user-1",
				keys: { FAL_KEY: "fal-secret", GEMINI_API_KEY: "gemini-secret" },
			})
		).resolves.toEqual({ saved: 2 });

		expect(database.transaction).toHaveBeenCalledTimes(1);
		expect(database.insert).toHaveBeenCalledTimes(2);
		expect(database.values).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user-1",
				key: "FAL_KEY",
				value: "fal-secret",
			})
		);
		expect(database.values).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user-1",
				key: "GEMINI_API_KEY",
				value: "gemini-secret",
			})
		);
	});
});
