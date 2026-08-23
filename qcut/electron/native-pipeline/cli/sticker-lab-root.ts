export function resolveStickerLabRootOverride({
	environment = process.env,
	root,
}: {
	environment?: Readonly<Record<string, string | undefined>>;
	root?: string;
}): string | undefined {
	const explicitRoot = root?.trim();
	if (explicitRoot) return explicitRoot;
	const configuredRoot = environment.QCUT_STICKER_LAB_ROOT?.trim();
	return configuredRoot || undefined;
}
