/**
 * Sentinel that opens a gate to every signed-in account.
 *
 * Only meaningful for gates whose content is safe to hand to any user. The
 * Sound Effects Lab and Sticker Lab reference tiers are NOT that: their
 * manifests declare `redistribution: "prohibited"`, so opening them ships
 * third-party audio/artwork to everyone running a release build.
 */
export const ALLOW_ANY_SIGNED_IN_USER = "*";

function parseAllowedUserIds({
	allowlist,
}: {
	allowlist: string | undefined;
}): string[] {
	return (allowlist ?? "")
		.split(",")
		.map((allowedUserId) => allowedUserId.trim())
		.filter((allowedUserId) => allowedUserId.length > 0);
}

export function isUserIdAllowlisted({
	allowlist,
	userId,
}: {
	allowlist: string | undefined;
	userId: string | undefined;
}): boolean {
	// Still requires a valid session — "*" widens who may pass, it never lets
	// an unauthenticated caller through.
	if (!userId) return false;

	const allowedUserIds = parseAllowedUserIds({ allowlist });
	if (allowedUserIds.includes(ALLOW_ANY_SIGNED_IN_USER)) return true;
	return allowedUserIds.includes(userId);
}

/**
 * Checks an explicit-ID-only gate. A wildcard token invalidates the entire
 * configuration so a broad entitlement cannot be copied onto restricted data.
 */
export function isUserIdExplicitlyAllowlisted({
	allowlist,
	userId,
}: {
	allowlist: string | undefined;
	userId: string | undefined;
}): boolean {
	if (!userId) return false;

	const allowedUserIds = parseAllowedUserIds({ allowlist });
	if (allowedUserIds.includes(ALLOW_ANY_SIGNED_IN_USER)) return false;
	return allowedUserIds.includes(userId);
}
