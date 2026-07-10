export interface CurvedCharacterTransform {
	character: string;
	x: number;
	y: number;
	rotation: number;
}

export function getCurvedTextTransforms({
	text,
	width,
	curve,
}: {
	text: string;
	width: number;
	curve: number;
}): CurvedCharacterTransform[] {
	const characters = Array.from(text.replace(/\s*\n\s*/g, " "));
	if (characters.length === 0) return [];
	if (Math.abs(curve) < 0.01 || characters.length === 1) {
		return characters.map((character, index) => ({
			character,
			x:
				characters.length === 1
					? 0
					: -width / 2 + (index / (characters.length - 1)) * width,
			y: 0,
			rotation: 0,
		}));
	}

	const span = (Math.min(180, Math.abs(curve)) * Math.PI) / 180;
	const radius = width / span;
	const direction = Math.sign(curve);

	return characters.map((character, index) => {
		const progress = index / (characters.length - 1);
		const angle = -span / 2 + progress * span;
		return {
			character,
			x: Math.sin(angle) * radius,
			y: (1 - Math.cos(angle)) * radius * direction,
			rotation: ((angle * 180) / Math.PI) * direction,
		};
	});
}
