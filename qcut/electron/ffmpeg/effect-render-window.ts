import type { EffectRenderWindow } from "./effect-render-types";

function numberExpression({ value }: { value: number }): string {
	return String(Number(value.toFixed(8)));
}

export function effectWindowExpression({
	window,
	timeVariable,
}: {
	window?: EffectRenderWindow;
	timeVariable: string;
}): string | undefined {
	if (!window) return;
	return (
		`gte(${timeVariable},${numberExpression({ value: window.startSeconds })})*` +
		`lt(${timeVariable},${numberExpression({ value: window.endSeconds })})`
	);
}

export function gateEffectExpression({
	active,
	inactive,
	window,
	timeVariable,
}: {
	active: string;
	inactive: string;
	window?: EffectRenderWindow;
	timeVariable: string;
}): string {
	const enabled = effectWindowExpression({ window, timeVariable });
	return enabled ? `if(${enabled},${active},${inactive})` : active;
}

export function effectWindowLocalTime({
	window,
	timeVariable,
}: {
	window?: EffectRenderWindow;
	timeVariable: string;
}): string {
	if (!window) return timeVariable;
	return `(${timeVariable})-${numberExpression({ value: window.startSeconds })}`;
}

export function effectWindowDuration({
	window,
	fallback,
}: {
	window?: EffectRenderWindow;
	fallback: number;
}): number {
	return window
		? Math.max(0.001, window.endSeconds - window.startSeconds)
		: fallback;
}
