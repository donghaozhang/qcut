import { describe, expect, it } from "vitest";
import {
	compileTextAnimation,
	evaluateTextAnimationFrame,
	normalizeTextAnimations,
	segmentText,
	type TextAnimationFrameState,
	type TextAnimationLayout,
} from "@qcut/editor-core/text-animation";
import { TRANSLATIONS } from "@/lib/i18n/translations";
import type { TextElement, TextAnimationsV1 } from "@/types/timeline";
import {
	applyTextAnimationPreset,
	createTextAnimationPhaseSnapshot,
	filterTextAnimationPresets,
	getTextAnimationPhaseIntensity,
	TEXT_ANIMATION_PRESETS,
	TEXT_ANIMATION_PHASES,
	updateTextAnimationPhaseIntensity,
	updateTextAnimationPhaseTiming,
} from "../text-animation-presets";

const SAMPLE_PROGRESS = [0, 0.25, 0.5, 0.75] as const;

const REQUIRED_ENTRANCE_NAMES = [
	"打字光标",
	"文字渐显",
	"<打字机",
	"打字机 I",
	"打字机 II",
	"向右模糊 II",
	"旋转飞入",
	"预览打字",
	"打字机 IV",
	"放大",
	"环绕消失",
	"光标打字",
	"向上弹入",
	"弹入",
	"向上滑动",
	"淡入文字",
	"激光雕刻",
	"爱心弹跳",
	"旋入",
] as const;

function findPreset({
	phase,
	presetId,
}: {
	phase: keyof typeof TEXT_ANIMATION_PRESETS;
	presetId: string;
}) {
	const preset = TEXT_ANIMATION_PRESETS[phase].find(
		(candidate) => candidate.id === presetId
	);
	expect(preset).toBeDefined();
	return preset!;
}

function createTextElement({
	animations,
	content = "AB CD",
}: {
	animations: TextAnimationsV1;
	content?: string;
}): TextElement {
	return {
		id: "text-animation-preset-test",
		type: "text",
		name: "Text animation preset",
		content,
		fontSize: 40,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		width: 100,
		height: 40,
		duration: 3,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		textAnimations: animations,
	};
}

function createLayout({ content }: { content: string }): TextAnimationLayout {
	const graphemes = segmentText({ content, unit: "grapheme" });
	return {
		bounds: { x: 0, y: 0, width: 100, height: 40 },
		fontSize: 40,
		graphemes: graphemes.map((segment, index) => ({
			index,
			start: segment.start,
			end: segment.end,
			lineIndex: 0,
			bounds: { x: index * 16, y: 0, width: 16, height: 40 },
		})),
	};
}

function compilePreset({
	phase,
	presetId,
}: {
	phase: keyof typeof TEXT_ANIMATION_PRESETS;
	presetId: string;
}) {
	const preset = findPreset({ phase, presetId });
	const applied = applyTextAnimationPreset({
		animations: undefined,
		preset,
	});
	const animations = updateTextAnimationPhaseTiming({
		animations: applied,
		phase,
		duration: 1,
		delay: 0,
	});
	const element = createTextElement({ animations });
	const compiled = compileTextAnimation({ element, fps: 100 });
	return { animations, compiled, element };
}

function samplePhase({
	phase,
	presetId,
}: {
	phase: keyof typeof TEXT_ANIMATION_PRESETS;
	presetId: string;
}): TextAnimationFrameState[] {
	const { compiled, element } = compilePreset({ phase, presetId });
	const compiledPhase = compiled[phase];
	expect(compiledPhase).toBeDefined();
	const layout = createLayout({ content: element.content });
	return SAMPLE_PROGRESS.map((progress) =>
		evaluateTextAnimationFrame({
			compiled,
			frame:
				compiledPhase!.startFrame +
				Math.round(progress * compiledPhase!.durationFrames),
			layout,
		})
	);
}

function roundedSamples({ values }: { values: number[] }): number[] {
	return values.map((value) =>
		Math.abs(value) < 0.000_05 ? 0 : Number(value.toFixed(4))
	);
}

describe("text animation preset registry", () => {
	it("keeps the no-animation card first in every phase", () => {
		for (const phase of TEXT_ANIMATION_PHASES) {
			expect(TEXT_ANIMATION_PRESETS[phase][0]?.id).toBe("none");
		}
	});

	it("covers every named entrance effect from the reference panel", () => {
		const names = TEXT_ANIMATION_PRESETS.entrance.map(
			(preset) => TRANSLATIONS.zh[preset.nameKey]
		);
		for (const requiredName of REQUIRED_ENTRANCE_NAMES) {
			expect(names).toContain(requiredName);
		}
	});

	it("uses unique ids within each phase", () => {
		for (const phase of TEXT_ANIMATION_PHASES) {
			const ids = TEXT_ANIMATION_PRESETS[phase].map((preset) => preset.id);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});

	it("creates complete canonical phase snapshots", () => {
		for (const phase of TEXT_ANIMATION_PHASES) {
			for (const preset of TEXT_ANIMATION_PRESETS[phase]) {
				if (preset.id === "none") continue;
				const snapshot = createTextAnimationPhaseSnapshot({ preset });
				expect(snapshot.sourcePreset).toEqual({ id: preset.id, version: 1 });
				expect(snapshot.timing).toEqual(
					expect.objectContaining({
						duration: preset.defaultDuration,
						delay: preset.defaultDelay,
						easing: expect.anything(),
					})
				);
				expect(snapshot.sequence).toEqual(
					expect.objectContaining({
						unit: expect.any(String),
						order: expect.any(String),
						staggerRatio: expect.any(Number),
						seed: expect.any(Number),
					})
				);
				expect(snapshot.target).toMatch(/^text/);
				expect(snapshot.effect.kind).toEqual(expect.any(String));
				if (phase === "loop") {
					expect(snapshot).toEqual(
						expect.objectContaining({
							repeat: expect.objectContaining({
								mode: expect.any(String),
								gap: expect.any(Number),
								phaseOffset: expect.any(Number),
							}),
						})
					);
				}
			}
		}
	});

	it("preserves every granular preset through apply, normalize, and compile", () => {
		const granularPresetIds: string[] = [];
		for (const phase of TEXT_ANIMATION_PHASES) {
			for (const preset of TEXT_ANIMATION_PRESETS[phase]) {
				if (preset.id === "none") continue;
				const applied = applyTextAnimationPreset({
					animations: undefined,
					preset,
				});
				const appliedPhase = applied[phase];
				if (!appliedPhase || appliedPhase.sequence.unit === "all") continue;
				granularPresetIds.push(preset.id);
				const element = createTextElement({ animations: applied });
				const normalized = normalizeTextAnimations({ element }).animation?.[
					phase
				];
				const compiled = compileTextAnimation({ element, fps: 30 })[phase];
				const expectedUnitCount = segmentText({
					content: element.content,
					unit: appliedPhase.sequence.unit,
				}).length;

				expect(appliedPhase.target).toBe("text");
				expect(normalized?.sequence).toMatchObject({
					unit: appliedPhase.sequence.unit,
					staggerRatio: appliedPhase.sequence.staggerRatio,
				});
				expect(compiled?.config.sequence).toMatchObject({
					unit: appliedPhase.sequence.unit,
					staggerRatio: appliedPhase.sequence.staggerRatio,
				});
				expect(compiled?.units).toHaveLength(expectedUnitCount);
			}
		}

		expect(granularPresetIds).toContain("typewriter-i");
		expect(granularPresetIds).toContain("wave");
		// Jianying's 文字渐显 fades the whole block at once, so it must NOT
		// stagger per grapheme.
		expect(granularPresetIds).not.toContain("fade-characters");
	});

	it("applies the bounce-up spring once across quarter-cycle samples", () => {
		const preset = findPreset({
			phase: "entrance",
			presetId: "bounce-up",
		});
		const snapshot = createTextAnimationPhaseSnapshot({ preset });
		const samples = samplePhase({
			phase: "entrance",
			presetId: "bounce-up",
		});

		expect(snapshot.timing.easing).toBe("linear");
		expect(snapshot.effect.kind).toBe("bounce");
		expect(
			roundedSamples({
				values: samples.map(({ container }) => container.translateY),
			})
		).toEqual([9.6, -1.6956, 0.2991, -0.0527]);
	});

	it("keeps loop bounce and heartbeat moving across the full cycle", () => {
		const bounce = samplePhase({
			phase: "loop",
			presetId: "bounce",
		});
		const heartbeat = samplePhase({
			phase: "loop",
			presetId: "heartbeat",
		});

		expect(
			roundedSamples({
				values: bounce.map(({ container }) => container.translateY),
			})
		).toEqual([0, -2.8, -5.6, -2.8]);
		expect(
			roundedSamples({
				values: heartbeat.map(({ container }) => container.scaleX),
			})
		).toEqual([1, 0.93, 0.86, 0.93]);
		expect(
			bounce.every(({ activePhases }) => activePhases.includes("loop"))
		).toBe(true);
		expect(
			heartbeat.every(({ activePhases }) => activePhases.includes("loop"))
		).toBe(true);
	});

	it("uses the Jianying loop formulas for pulse, sway, and wave", () => {
		const pulse = samplePhase({ phase: "loop", presetId: "pulse" });
		const sway = samplePhase({ phase: "loop", presetId: "sway" });
		const wave = samplePhase({ phase: "loop", presetId: "wave" });
		const pulseSnapshot = createTextAnimationPhaseSnapshot({
			preset: findPreset({ phase: "loop", presetId: "pulse" }),
		});
		const swaySnapshot = createTextAnimationPhaseSnapshot({
			preset: findPreset({ phase: "loop", presetId: "sway" }),
		});
		const waveSnapshot = createTextAnimationPhaseSnapshot({
			preset: findPreset({ phase: "loop", presetId: "wave" }),
		});

		expect(
			roundedSamples({
				values: pulse.map(({ container }) => container.scaleX),
			})
		).toEqual([1, 0.925, 0.85, 0.925]);
		expect(
			roundedSamples({
				values: sway.map(({ units }) => units.at(0)?.visual.rotationDeg ?? 0),
			})
		).toEqual([20, 0, -20, 0]);
		expect(
			sway.every(({ units }) =>
				units.every(({ visual }) => visual.transformOrigin === "bottomCenter")
			)
		).toBe(true);
		expect(
			new Set(
				wave.at(0)?.units.map(({ visual }) => visual.translateY.toFixed(4))
			).size
		).toBeGreaterThan(1);
		expect(pulseSnapshot).toMatchObject({
			timing: { duration: 1.5 },
			repeat: { mode: "restart" },
			effect: {
				kind: "scale",
				pulse: { cycles: 5, easing: "smoothstep" },
			},
		});
		expect(swaySnapshot).toMatchObject({
			sequence: { unit: "grapheme", staggerRatio: 0 },
			repeat: { mode: "restart" },
		});
		expect(waveSnapshot).toMatchObject({
			sequence: { unit: "grapheme", staggerRatio: 0 },
			repeat: { mode: "restart" },
		});
	});

	it("removes only the selected phase when None is applied", () => {
		const entrance = TEXT_ANIMATION_PRESETS.entrance[1];
		const exit = TEXT_ANIMATION_PRESETS.exit[1];
		const withEntrance = applyTextAnimationPreset({
			animations: undefined,
			preset: entrance,
		});
		const withBoth = applyTextAnimationPreset({
			animations: withEntrance,
			preset: exit,
		});
		const result = applyTextAnimationPreset({
			animations: withBoth,
			preset: TEXT_ANIMATION_PRESETS.entrance[0],
		});

		expect(result.entrance).toBeUndefined();
		expect(result.exit?.sourcePreset?.id).toBe(exit.id);
		expect(result.schemaVersion).toBe(1);
	});

	it("updates timing without replacing the selected effect", () => {
		const preset = TEXT_ANIMATION_PRESETS.entrance.find(
			(candidate) => candidate.id === "scale-up"
		);
		expect(preset).toBeDefined();
		const animations = applyTextAnimationPreset({
			animations: undefined,
			preset: preset!,
		});
		const updated = updateTextAnimationPhaseTiming({
			animations,
			phase: "entrance",
			duration: 2.25,
			delay: 0.4,
		});

		expect(updated.entrance?.timing.duration).toBe(2.25);
		expect(updated.entrance?.timing.delay).toBe(0.4);
		expect(updated.entrance?.effect).toEqual(animations.entrance?.effect);
	});

	it("round-trips preset intensity through its effect parameters", () => {
		const preset = TEXT_ANIMATION_PRESETS.entrance.find(
			(candidate) => candidate.id === "scale-up"
		);
		expect(preset).toBeDefined();
		const animations = applyTextAnimationPreset({
			animations: undefined,
			preset: preset!,
		});
		const updated = updateTextAnimationPhaseIntensity({
			animations,
			phase: "entrance",
			intensity: 0.35,
		});

		expect(
			getTextAnimationPhaseIntensity({
				animations: updated,
				phase: "entrance",
			})
		).toBeCloseTo(0.35);
		expect(updated.entrance?.timing).toEqual(animations.entrance?.timing);
	});

	it.each([
		["flip-3d", 0.5],
		["cylinder-3d", 0.5],
		["jitter-3d", 0.4],
	] as const)("round-trips %s intensity", (presetId, intensity) => {
		const preset = findPreset({ phase: "loop", presetId });
		const animations = applyTextAnimationPreset({
			animations: undefined,
			preset,
		});
		const updated = updateTextAnimationPhaseIntensity({
			animations,
			phase: "loop",
			intensity,
		});

		expect(
			getTextAnimationPhaseIntensity({
				animations: updated,
				phase: "loop",
			})
		).toBeCloseTo(intensity);
	});

	it("searches localized names and aliases", () => {
		expect(
			filterTextAnimationPresets({
				phase: "entrance",
				query: "激光",
				translate: (key) => TRANSLATIONS.zh[key],
			}).map((preset) => preset.id)
		).toEqual(["laser-etch"]);
		expect(
			filterTextAnimationPresets({
				phase: "loop",
				query: "heartbeat",
				translate: (key) => TRANSLATIONS.en[key],
			}).map((preset) => preset.id)
		).toEqual(["heartbeat"]);
	});
});
