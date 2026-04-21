import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { AIActiveTab } from "../../types/ai-types";
import {
	TAB_DEFAULT_MODELS,
	useSelectedModelsByTab,
} from "../use-selected-models-by-tab";

/**
 * Regression tests for the "T2V model leaks into Upscale tab" bug:
 *   docs/task/ai-panel-tab-isolation/plan.md
 *
 * Each tab must own an independent `selectedModels` array. Switching
 * tabs must never cause one tab's selections to appear in another.
 */
describe("useSelectedModelsByTab", () => {
	describe("initial defaults", () => {
		const cases: AIActiveTab[] = [
			"text",
			"image",
			"avatar",
			"upscale",
			"angles",
		];

		for (const tab of cases) {
			it(`starts ${tab} tab with its default model`, () => {
				const { result } = renderHook(() => useSelectedModelsByTab(tab));
				expect(result.current.selectedModels).toEqual([
					...TAB_DEFAULT_MODELS[tab],
				]);
			});
		}

		it("seeds every tab — no tab is empty by default", () => {
			const { result } = renderHook(() => useSelectedModelsByTab("text"));
			for (const tab of cases) {
				expect(result.current.selectedModelsByTab[tab].length).toBeGreaterThan(
					0
				);
			}
		});
	});

	describe("cross-tab isolation", () => {
		it("selecting a model on one tab does not change another tab", () => {
			const { result, rerender } = renderHook(
				({ tab }: { tab: AIActiveTab }) => useSelectedModelsByTab(tab),
				{ initialProps: { tab: "upscale" as AIActiveTab } }
			);

			act(() => {
				result.current.setSelectedModels(["flashvsr_video_upscaler"]);
			});
			expect(result.current.selectedModels).toEqual([
				"flashvsr_video_upscaler",
			]);

			rerender({ tab: "text" });
			expect(result.current.selectedModels).toEqual([
				...TAB_DEFAULT_MODELS.text,
			]);
			expect(result.current.selectedModels).not.toContain(
				"flashvsr_video_upscaler"
			);
		});

		it("regression: T2V model selected on Text never appears on Upscale", () => {
			const { result, rerender } = renderHook(
				({ tab }: { tab: AIActiveTab }) => useSelectedModelsByTab(tab),
				{ initialProps: { tab: "text" as AIActiveTab } }
			);

			act(() => {
				result.current.setSelectedModels(["gmi_seedance_2_0_fast_260128_t2v"]);
			});

			rerender({ tab: "upscale" });

			expect(result.current.selectedModels).toEqual([
				...TAB_DEFAULT_MODELS.upscale,
			]);
			expect(result.current.selectedModels).not.toContain(
				"gmi_seedance_2_0_fast_260128_t2v"
			);

			act(() => {
				result.current.setSelectedModels((prev) => [
					...prev,
					"topaz_video_upscale",
				]);
			});

			for (const id of result.current.selectedModels) {
				expect(id.includes("_t2v")).toBe(false);
			}
		});
	});

	describe("tab-switch preservation", () => {
		it("preserves the user's selections when leaving and returning to a tab", () => {
			const { result, rerender } = renderHook(
				({ tab }: { tab: AIActiveTab }) => useSelectedModelsByTab(tab),
				{ initialProps: { tab: "text" as AIActiveTab } }
			);

			act(() => {
				result.current.setSelectedModels(["model_a", "model_b", "model_c"]);
			});
			expect(result.current.selectedModels).toEqual([
				"model_a",
				"model_b",
				"model_c",
			]);

			rerender({ tab: "upscale" });
			rerender({ tab: "text" });

			expect(result.current.selectedModels).toEqual([
				"model_a",
				"model_b",
				"model_c",
			]);
		});
	});

	describe("setSelectedModels signature", () => {
		it("accepts a plain array", () => {
			const { result } = renderHook(() => useSelectedModelsByTab("text"));
			act(() => {
				result.current.setSelectedModels(["x", "y"]);
			});
			expect(result.current.selectedModels).toEqual(["x", "y"]);
		});

		it("accepts a functional updater operating on the active tab's slice", () => {
			const { result } = renderHook(() => useSelectedModelsByTab("text"));
			const initial = result.current.selectedModels;
			act(() => {
				result.current.setSelectedModels((prev) => {
					expect(prev).toEqual(initial);
					return [...prev, "extra"];
				});
			});
			expect(result.current.selectedModels).toEqual([...initial, "extra"]);
		});

		it("functional updater that returns the same array skips a re-render", () => {
			const { result } = renderHook(() => useSelectedModelsByTab("text"));
			const beforeRef = result.current.selectedModelsByTab;
			act(() => {
				result.current.setSelectedModels((prev) => prev);
			});
			expect(result.current.selectedModelsByTab).toBe(beforeRef);
		});
	});
});
