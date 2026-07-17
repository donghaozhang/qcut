/**
 * Render a small procedural cover as a data URL for tracks that have no real
 * artwork (e.g. AI-generated music). Runtime counterpart of the build-time
 * generator in apps/web/scripts/generate-builtin-audio-artwork.ts.
 */

const ARTWORK_SIZE = 256;

const ARTWORK_PALETTES: readonly (readonly [string, string])[] = [
	["#166534", "#86efac"],
	["#1e3a8a", "#93c5fd"],
	["#701a75", "#f0abfc"],
	["#7c2d12", "#fdba74"],
	["#134e4a", "#5eead4"],
	["#3f3f46", "#e4e4e7"],
];

export function audioArtworkSeed({ value }: { value: string }): number {
	let hash = 2_166_136_261;
	for (const char of value) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 16_777_619);
	}
	return hash >>> 0;
}

function seededRandom({ seed }: { seed: number }): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function renderAudioArtworkDataUrl({
	seed,
	colors,
}: {
	seed: number;
	colors?: readonly [string, string];
}): string | undefined {
	if (typeof document === "undefined") return undefined;
	const random = seededRandom({ seed });
	const [base, accent] =
		colors ?? ARTWORK_PALETTES[seed % ARTWORK_PALETTES.length];

	const canvas = document.createElement("canvas");
	canvas.width = ARTWORK_SIZE;
	canvas.height = ARTWORK_SIZE;
	const context = canvas.getContext("2d");
	if (!context) return undefined;

	const angle = random() * Math.PI;
	const gradient = context.createLinearGradient(
		ARTWORK_SIZE / 2 - (Math.cos(angle) * ARTWORK_SIZE) / 2,
		ARTWORK_SIZE / 2 - (Math.sin(angle) * ARTWORK_SIZE) / 2,
		ARTWORK_SIZE / 2 + (Math.cos(angle) * ARTWORK_SIZE) / 2,
		ARTWORK_SIZE / 2 + (Math.sin(angle) * ARTWORK_SIZE) / 2
	);
	gradient.addColorStop(0, base);
	gradient.addColorStop(1, accent);
	context.fillStyle = gradient;
	context.fillRect(0, 0, ARTWORK_SIZE, ARTWORK_SIZE);

	// Concentric arcs + waveform, matching the bundled-cover music motif.
	context.strokeStyle = `${accent}66`;
	const centerX = ARTWORK_SIZE * (0.3 + random() * 0.4);
	const centerY = ARTWORK_SIZE * (0.3 + random() * 0.35);
	for (let ring = 0; ring < 5; ring += 1) {
		context.beginPath();
		context.lineWidth = 1.5 + random() * 2;
		const radius = ARTWORK_SIZE * (0.12 + ring * 0.12 + random() * 0.03);
		const start = random() * Math.PI * 2;
		context.arc(
			centerX,
			centerY,
			radius,
			start,
			start + Math.PI * (0.8 + random())
		);
		context.stroke();
	}
	context.strokeStyle = "#ffffffcc";
	context.lineWidth = 3;
	context.beginPath();
	const baseline = ARTWORK_SIZE * 0.78;
	for (let x = 0; x <= ARTWORK_SIZE; x += 4) {
		const wave =
			Math.sin(x * 0.05 + random() * 0.4) * 10 +
			Math.sin(x * 0.017 + angle) * 14;
		if (x === 0) context.moveTo(x, baseline + wave);
		else context.lineTo(x, baseline + wave);
	}
	context.stroke();

	try {
		const dataUrl = canvas.toDataURL("image/webp", 0.82);
		return dataUrl.startsWith("data:image/") ? dataUrl : undefined;
	} catch {
		return undefined;
	}
}
