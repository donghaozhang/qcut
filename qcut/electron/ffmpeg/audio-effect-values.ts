export function calculateReverbDecay({
	roomSize,
	damping,
}: {
	roomSize: number;
	damping: number;
}): number {
	const room = Math.min(1, Math.max(0, roomSize / 100));
	const dampingRatio = Math.min(1, Math.max(0, damping / 100));
	const roomDecay = 0.25 + room * 0.55;
	return Math.min(0.8, Math.max(0.05, roomDecay * (1 - dampingRatio * 0.75)));
}
