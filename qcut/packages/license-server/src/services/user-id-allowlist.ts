export function isUserIdAllowlisted({
	allowlist,
	userId,
}: {
	allowlist: string | undefined;
	userId: string | undefined;
}): boolean {
	if (!userId) return false;

	const allowedUserIds = (allowlist ?? "")
		.split(",")
		.map((allowedUserId) => allowedUserId.trim())
		.filter((allowedUserId) => allowedUserId.length > 0);
	return allowedUserIds.includes(userId);
}
