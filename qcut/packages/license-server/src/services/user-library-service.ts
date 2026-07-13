import { and, eq } from "drizzle-orm";
import { userLibraryDocuments } from "@qcut/db/schema";
import { db } from "../db/drizzle";

export type UserLibraryDocument = typeof userLibraryDocuments.$inferSelect;

export type PutUserLibraryDocumentResult =
	| { document: UserLibraryDocument; status: "updated" }
	| { current: UserLibraryDocument | null; status: "conflict" };

async function findUserLibraryDocument({
	userId,
	namespace,
	documentKey,
}: {
	userId: string;
	namespace: string;
	documentKey: string;
}): Promise<UserLibraryDocument | null> {
	const [document] = await db
		.select()
		.from(userLibraryDocuments)
		.where(
			and(
				eq(userLibraryDocuments.userId, userId),
				eq(userLibraryDocuments.namespace, namespace),
				eq(userLibraryDocuments.documentKey, documentKey)
			)
		)
		.limit(1);
	return document ?? null;
}

export async function listUserLibraryDocuments({
	userId,
	namespace,
}: {
	userId: string;
	namespace?: string;
}): Promise<UserLibraryDocument[]> {
	const query = db
		.select()
		.from(userLibraryDocuments)
		.where(
			namespace
				? and(
						eq(userLibraryDocuments.userId, userId),
						eq(userLibraryDocuments.namespace, namespace)
					)
				: eq(userLibraryDocuments.userId, userId)
		);
	return query;
}

export async function putUserLibraryDocument({
	userId,
	namespace,
	documentKey,
	payload,
	baseVersion,
}: {
	userId: string;
	namespace: string;
	documentKey: string;
	payload: unknown;
	baseVersion: number;
}): Promise<PutUserLibraryDocumentResult> {
	const current = await findUserLibraryDocument({
		userId,
		namespace,
		documentKey,
	});
	const now = new Date();
	if (!current) {
		if (baseVersion !== 0) return { current: null, status: "conflict" };
		try {
			const [document] = await db
				.insert(userLibraryDocuments)
				.values({
					id: crypto.randomUUID(),
					userId,
					namespace,
					documentKey,
					payload,
					version: 1,
					createdAt: now,
					updatedAt: now,
				})
				.returning();
			if (!document) throw new Error("Library document insert returned no row");
			return { document, status: "updated" };
		} catch {
			return {
				current: await findUserLibraryDocument({
					userId,
					namespace,
					documentKey,
				}),
				status: "conflict",
			};
		}
	}

	if (current.version !== baseVersion) {
		return { current, status: "conflict" };
	}
	const [document] = await db
		.update(userLibraryDocuments)
		.set({ payload, version: current.version + 1, updatedAt: now })
		.where(
			and(
				eq(userLibraryDocuments.id, current.id),
				eq(userLibraryDocuments.userId, userId),
				eq(userLibraryDocuments.version, baseVersion)
			)
		)
		.returning();
	if (document) return { document, status: "updated" };
	return {
		current: await findUserLibraryDocument({
			userId,
			namespace,
			documentKey,
		}),
		status: "conflict",
	};
}
