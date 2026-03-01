import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIGenerationFeedback } from "./ai-generation-feedback";
import { AIValidationMessages } from "./ai-validation-messages";
import type { AIActiveTab, GeneratedVideoResult } from "../types/ai-types";

interface AIActionsSectionProps {
	activeTab: AIActiveTab;
	selectedModels: string[];
	prompt: string;
	selectedImage: File | null;
	error: string | null;
	generation: {
		isGenerating: boolean;
		generationProgress: number;
		statusMessage: string;
		elapsedTime: number;
		hasResults: boolean;
		generatedVideos: GeneratedVideoResult[];
		canGenerate: boolean;
		handleGenerate: () => void;
		hasVeo31FrameToVideo: boolean;
	};
	firstFrame: File | null;
	lastFrame: File | null;
	avatarImage: File | null;
	syncLipsyncSourceVideo: File | null;
	audioFile: File | null;
	totalCost: number;
	hasRemixSelected: boolean;
}

export function AIActionsSection({
	activeTab,
	selectedModels,
	prompt,
	selectedImage,
	error,
	generation,
	firstFrame,
	lastFrame,
	avatarImage,
	syncLipsyncSourceVideo,
	audioFile,
	totalCost,
	hasRemixSelected,
}: AIActionsSectionProps) {
	return (
		<>
			{/* Cost Summary */}
			{selectedModels.length > 0 && (
				<div className="p-3 bg-muted/30 rounded-md">
					<div className="flex justify-between items-center">
						<span className="text-xs font-medium">Estimated Cost:</span>
						<span className="text-xs font-semibold">
							${totalCost.toFixed(2)}
							{hasRemixSelected && " + remix varies"}
						</span>
					</div>
				</div>
			)}

			{/* Error, Progress, and Generated Videos */}
			<AIGenerationFeedback
				error={error}
				isGenerating={generation.isGenerating}
				generationProgress={generation.generationProgress}
				statusMessage={generation.statusMessage}
				elapsedTime={generation.elapsedTime}
				hasResults={generation.hasResults}
				generatedVideos={generation.generatedVideos}
			/>

			{/* Validation Messages */}
			{!generation.canGenerate && selectedModels.length > 0 && (
				<AIValidationMessages
					activeTab={activeTab}
					selectedModels={selectedModels}
					prompt={prompt}
					selectedImage={selectedImage}
					hasVeo31FrameToVideo={generation.hasVeo31FrameToVideo}
					firstFrame={firstFrame}
					lastFrame={lastFrame}
					avatarImage={avatarImage}
					syncLipsyncSourceVideo={syncLipsyncSourceVideo}
					audioFile={audioFile}
				/>
			)}

			{/* Generate Button */}
			<Button
				type="button"
				className="w-full"
				disabled={!generation.canGenerate || generation.isGenerating}
				onClick={generation.handleGenerate}
			>
				{generation.isGenerating ? (
					<>
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						Generating...
					</>
				) : (
					<>Generate ({selectedModels.length} models)</>
				)}
			</Button>
		</>
	);
}
