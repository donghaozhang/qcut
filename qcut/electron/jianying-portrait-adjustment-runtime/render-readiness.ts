export const SPOT_ACNE_MAX_RENDER_ATTEMPTS = 8;

export async function renderUntilOutputChanges({
	renderAttempt,
	isOutputChanged,
	maxAttempts,
	attempt = 1,
}: {
	renderAttempt: ({ attempt }: { attempt: number }) => Promise<void>;
	isOutputChanged: () => Promise<boolean>;
	maxAttempts: number;
	attempt?: number;
}): Promise<number> {
	await renderAttempt({ attempt });
	if ((await isOutputChanged()) || attempt >= maxAttempts) return attempt;
	return renderUntilOutputChanges({
		renderAttempt,
		isOutputChanged,
		maxAttempts,
		attempt: attempt + 1,
	});
}
