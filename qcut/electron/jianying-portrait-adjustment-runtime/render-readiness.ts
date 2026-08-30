export const SPOT_ACNE_MAX_RENDER_ATTEMPTS = 8;
export const PORTRAIT_FRAME_MAX_RENDER_ATTEMPTS = 3;

const MAX_PIXEL_SAMPLES = 4_096;
const VISIBLE_CHANNEL_THRESHOLD = 16;
const MIN_VISIBLE_SAMPLE_RATIO = 0.01;

function hasVisiblePixels({ rgba }: { rgba: Uint8Array }): boolean {
	const pixelCount = Math.floor(rgba.byteLength / 4);
	if (pixelCount === 0) return false;
	const pixelStep = Math.max(1, Math.floor(pixelCount / MAX_PIXEL_SAMPLES));
	let sampledPixels = 0;
	let visiblePixels = 0;
	for (let pixel = 0; pixel < pixelCount; pixel += pixelStep) {
		const offset = pixel * 4;
		const alpha = rgba[offset + 3] ?? 0;
		const brightestChannel = Math.max(
			rgba[offset] ?? 0,
			rgba[offset + 1] ?? 0,
			rgba[offset + 2] ?? 0
		);
		if (
			alpha > VISIBLE_CHANNEL_THRESHOLD &&
			brightestChannel > VISIBLE_CHANNEL_THRESHOLD
		) {
			visiblePixels += 1;
		}
		sampledPixels += 1;
	}
	return visiblePixels / sampledPixels >= MIN_VISIBLE_SAMPLE_RATIO;
}

export function isUnexpectedlyBlankPortraitFrame({
	input,
	output,
}: {
	input: Uint8Array;
	output: Uint8Array;
}): boolean {
	if (input.byteLength !== output.byteLength) return true;
	return (
		hasVisiblePixels({ rgba: input }) && !hasVisiblePixels({ rgba: output })
	);
}

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
