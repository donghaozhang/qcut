import { and, eq } from "@qcut/db";
import { agentSecrets } from "@qcut/db/schema";
import { db } from "../db/drizzle";

export type UserKey = typeof agentSecrets.$inferSelect;

export async function listUserKeys({
	userId,
}: {
	userId: string;
}): Promise<UserKey[]> {
	return db.select().from(agentSecrets).where(eq(agentSecrets.userId, userId));
}

export async function upsertUserKeys({
	userId,
	keys,
}: {
	userId: string;
	keys: Record<string, string>;
}): Promise<{ saved: number }> {
	const now = new Date();
	let saved = 0;
	for (const [key, value] of Object.entries(keys)) {
		await db
			.insert(agentSecrets)
			.values({
				id: crypto.randomUUID(),
				userId,
				key,
				value,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [agentSecrets.userId, agentSecrets.key],
				set: { value, updatedAt: now },
			});
		saved++;
	}
	return { saved };
}

export async function deleteUserKey({
	userId,
	key,
}: {
	userId: string;
	key: string;
}): Promise<{ deleted: boolean }> {
	const result = await db
		.delete(agentSecrets)
		.where(and(eq(agentSecrets.userId, userId), eq(agentSecrets.key, key)))
		.returning({ id: agentSecrets.id });
	return { deleted: result.length > 0 };
}
