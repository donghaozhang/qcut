import { and, eq } from "drizzle-orm";
import { reviewShares } from "@qcut/db/schema";
import type { ReviewPackage } from "@qcut/editor-core/collaboration";
import { db } from "../db/drizzle";

export type ReviewShare = typeof reviewShares.$inferSelect;

export type UpdateReviewShareResult =
	| { share: ReviewShare; status: "updated" }
	| { current: ReviewShare | null; status: "conflict" }
	| { status: "not-found" };

function bytesToBase64Url({ bytes }: { bytes: Uint8Array }): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/, "");
}

export function generateReviewToken({
	byteLength = 24,
}: {
	byteLength?: number;
} = {}): string {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	return bytesToBase64Url({ bytes });
}

export async function hashReviewToken({ token }: { token: string }) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token)
	);
	return bytesToBase64Url({ bytes: new Uint8Array(digest) });
}

function packageForStorage({
	reviewPackage,
}: {
	reviewPackage: ReviewPackage;
}): Record<string, unknown> {
	return structuredClone(reviewPackage) as unknown as Record<string, unknown>;
}

async function findActiveReviewShareByHash({
	tokenHash,
}: {
	tokenHash: string;
}): Promise<ReviewShare | null> {
	const [share] = await db
		.select()
		.from(reviewShares)
		.where(
			and(
				eq(reviewShares.tokenHash, tokenHash),
				eq(reviewShares.status, "active")
			)
		)
		.limit(1);
	if (!share) return null;
	if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) return null;
	return share;
}

export async function createReviewShare({
	ownerUserId,
	reviewPackage,
}: {
	ownerUserId: string;
	reviewPackage: ReviewPackage;
}): Promise<{ share: ReviewShare; token: string }> {
	const token = generateReviewToken();
	const tokenHash = await hashReviewToken({ token });
	const now = new Date();
	const [share] = await db
		.insert(reviewShares)
		.values({
			id: crypto.randomUUID(),
			ownerUserId,
			tokenHash,
			projectId: reviewPackage.project.id,
			projectName: reviewPackage.project.name,
			durationMs: Math.round(reviewPackage.project.duration * 1_000),
			package: packageForStorage({ reviewPackage }),
			revision: 1,
			status: "active",
			createdAt: now,
			updatedAt: now,
		})
		.returning();
	if (!share) throw new Error("Review share insert returned no row");
	return { share, token };
}

export async function getReviewShare({
	token,
}: {
	token: string;
}): Promise<ReviewShare | null> {
	return findActiveReviewShareByHash({
		tokenHash: await hashReviewToken({ token }),
	});
}

export async function updateReviewShare({
	token,
	baseRevision,
	reviewPackage,
}: {
	token: string;
	baseRevision: number;
	reviewPackage: ReviewPackage;
}): Promise<UpdateReviewShareResult> {
	const tokenHash = await hashReviewToken({ token });
	const current = await findActiveReviewShareByHash({ tokenHash });
	if (!current) return { status: "not-found" };
	if (
		current.revision !== baseRevision ||
		current.projectId !== reviewPackage.project.id
	) {
		return { current, status: "conflict" };
	}
	const [share] = await db
		.update(reviewShares)
		.set({
			projectName: reviewPackage.project.name,
			durationMs: Math.round(reviewPackage.project.duration * 1_000),
			package: packageForStorage({ reviewPackage }),
			revision: current.revision + 1,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(reviewShares.id, current.id),
				eq(reviewShares.status, "active"),
				eq(reviewShares.revision, baseRevision)
			)
		)
		.returning();
	if (share) return { share, status: "updated" };
	return {
		current: await findActiveReviewShareByHash({ tokenHash }),
		status: "conflict",
	};
}

export async function revokeReviewShare({
	token,
	ownerUserId,
}: {
	token: string;
	ownerUserId: string;
}): Promise<boolean> {
	const tokenHash = await hashReviewToken({ token });
	const [share] = await db
		.update(reviewShares)
		.set({ status: "revoked", updatedAt: new Date() })
		.where(
			and(
				eq(reviewShares.tokenHash, tokenHash),
				eq(reviewShares.ownerUserId, ownerUserId),
				eq(reviewShares.status, "active")
			)
		)
		.returning({ id: reviewShares.id });
	return Boolean(share);
}
