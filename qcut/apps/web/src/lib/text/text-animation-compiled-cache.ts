import {
	compileTextAnimation,
	type CompiledTextAnimation,
} from "@qcut/editor-core";
import type { TextElement } from "@/types/timeline";

interface CompiledAnimationCacheEntry {
	key: string;
	value: CompiledTextAnimation;
}

const compiledAnimationCache = new WeakMap<
	NonNullable<TextElement["textAnimations"]>,
	CompiledAnimationCacheEntry
>();

function buildCacheKey({
	element,
	fps,
}: {
	element: TextElement;
	fps: number;
}): string {
	return [
		fps,
		element.content,
		element.startTime,
		element.duration,
		element.trimStart,
		element.trimEnd,
	].join(":");
}

export function getCachedCompiledTextAnimation({
	element,
	fps,
}: {
	element: TextElement;
	fps: number;
}): CompiledTextAnimation {
	const safeFps = Math.min(240, Math.max(1, fps));
	const animations = element.textAnimations;
	if (!animations) return compileTextAnimation({ element, fps: safeFps });

	const key = buildCacheKey({ element, fps: safeFps });
	const cached = compiledAnimationCache.get(animations);
	if (cached?.key === key) return cached.value;

	const value = compileTextAnimation({ element, fps: safeFps });
	compiledAnimationCache.set(animations, { key, value });
	return value;
}
