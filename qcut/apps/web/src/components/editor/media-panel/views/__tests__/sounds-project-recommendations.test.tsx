import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectAudioRecommendations } from "@/lib/audio/audio-project-recommendations";
import { useLocaleStore } from "@/stores/locale-store";
import { ProjectAudioRecommendationSummary } from "../sounds-project-recommendations";

function recommendations({
	visionAnalyzedCount = 0,
}: {
	visionAnalyzedCount?: number;
} = {}): ProjectAudioRecommendations {
	return {
		sounds: [],
		music: [],
		soundEffects: [],
		signals: ["project"],
		cues: [],
		captionCount: 0,
		visualClipCount: 1,
		visionAnalyzedCount,
	};
}

describe("ProjectAudioRecommendationSummary", () => {
	beforeEach(() => {
		useLocaleStore.getState().setLocale({ locale: "zh" });
	});

	it("offers explicit visual analysis before using AI credits", () => {
		const onAnalyzeVisuals = vi.fn();
		render(
			<ProjectAudioRecommendationSummary
				canAnalyzeVisuals
				isAnalyzingVisuals={false}
				isPlacing={false}
				onAnalyzeVisuals={onAnalyzeVisuals}
				onAutoPlace={vi.fn()}
				recommendations={recommendations()}
			/>
		);

		expect(screen.getByText(/会消耗 AI 点数/)).toBeVisible();
		fireEvent.click(screen.getByRole("button", { name: "分析视频画面" }));
		expect(onAnalyzeVisuals).toHaveBeenCalledOnce();
	});

	it("shows the cached source count and refresh action", () => {
		render(
			<ProjectAudioRecommendationSummary
				canAnalyzeVisuals
				isAnalyzingVisuals={false}
				isPlacing={false}
				onAnalyzeVisuals={vi.fn()}
				onAutoPlace={vi.fn()}
				recommendations={recommendations({ visionAnalyzedCount: 2 })}
			/>
		);

		expect(
			screen.getByText("已缓存 2 个视频素材的画面理解结果。")
		).toBeVisible();
		expect(screen.getByRole("button", { name: "重新分析画面" })).toBeVisible();
	});
});
