import React, { useState } from "react";
import { useNanoEditStore } from "@/stores/editor/nano-edit-store";
import { FalAiService } from "@/services/ai/fal-ai-service";
import { PromptInput } from "./PromptInput";
import TransformationSelector from "./TransformationSelector";
import { THUMBNAIL_TEMPLATES } from "../constants/transformations";
import type { Transformation } from "@/types/nano-edit";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { openInNewTab } from "@/lib/utils";

export const ThumbnailGenerator: React.FC = () => {
	const { addAsset, isProcessing, assets } = useNanoEditStore();
	const [customPrompt, setCustomPrompt] = useState("");

	// Get project info (read-only access)
	const currentProject: { id: string } | undefined = undefined; // TODO: Add project store integration when needed

	const handleGenerate = async (prompt: string) => {
		try {
			const imageUrls = await FalAiService.generateImage(
				`YouTube thumbnail: ${prompt}`,
				{
					image_size: { width: 1280, height: 720 },
					num_images: 1,
				}
			);

			if (imageUrls.length > 0) {
				const asset = {
					id: crypto.randomUUID(),
					type: "thumbnail" as const,
					url: imageUrls[0],
					projectId: undefined,
					createdAt: new Date(),
					prompt,
					dimensions: "1280x720",
					transformation: undefined,
				};

				addAsset(asset);
			}
		} catch (error) {
			console.error("Error generating thumbnail:", error);
		}
	};

	const handleTransformationSelect = (transformation: Transformation) => {
		setCustomPrompt(transformation.prompt);
		handleGenerate(transformation.prompt);
	};

	const handleOrderChange = (newOrder: Transformation[]) => {
		// Optional: Handle reordering of transformations
		console.log("Transformation order changed:", newOrder);
	};

	const thumbnailAssets = assets.filter((asset) => asset.type === "thumbnail");

	return (
		<div className="bg-gray-800 rounded-lg p-4 space-y-4">
			{/* Header */}
			<div className="flex items-center gap-2">
				<div className="text-2xl">🖼️</div>
				<div>
					<h4 className="font-semibold text-white">Thumbnail Generator</h4>
					<p className="text-sm text-gray-200">
						Create eye-catching YouTube thumbnails
					</p>
				</div>
			</div>

			{/* Transformation Selector */}
			<TransformationSelector
				transformations={THUMBNAIL_TEMPLATES}
				onSelect={handleTransformationSelect}
				hasPreviousResult={thumbnailAssets.length > 0}
				onOrderChange={handleOrderChange}
			/>

			{/* Generation Form */}
			<PromptInput
				onGenerate={handleGenerate}
				placeholder="Describe your thumbnail: 'gaming victory celebration', 'cooking tutorial with ingredients', etc."
				label="Custom Thumbnail Description"
			/>

			{/* Loading State */}
			{isProcessing && (
				<div className="flex justify-center py-4">
					<LoadingSpinner message="Generating thumbnail..." />
				</div>
			)}

			{/* Generated Thumbnails */}
			{thumbnailAssets.length > 0 && (
				<div className="space-y-3">
					<h5 className="text-sm font-medium text-gray-200">
						Generated Thumbnails ({thumbnailAssets.length})
					</h5>
					<div className="grid grid-cols-2 gap-3">
						{thumbnailAssets.slice(0, 4).map((asset) => (
							<div key={asset.id} className="relative group">
								<button
									type="button"
									onClick={() => openInNewTab(asset.url)}
									className="w-full h-20 overflow-hidden rounded border border-gray-600 group-hover:border-blue-500 transition-colors"
									aria-label="Open generated thumbnail in new tab"
								>
									<img
										src={asset.url}
										alt="Generated thumbnail"
										className="w-full h-full object-cover"
									/>
								</button>
								<div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded transition-colors pointer-events-none" />
								{asset.prompt && (
									<div className="absolute bottom-1 left-1 right-1 text-xs text-white bg-black/70 px-1 py-0.5 rounded truncate opacity-0 group-hover:opacity-100 transition-opacity">
										{asset.prompt}
									</div>
								)}
							</div>
						))}
					</div>
					{thumbnailAssets.length > 4 && (
						<div className="text-xs text-gray-200 text-center">
							+{thumbnailAssets.length - 4} more thumbnails
						</div>
					)}
				</div>
			)}

			{/* Tips */}
			<div className="text-xs text-gray-200 bg-gray-900 p-3 rounded">
				<strong>💡 Tips:</strong> Be specific about colors, emotions, and key
				elements. Examples: "bright red gaming setup", "smiling chef with fresh
				vegetables"
			</div>
		</div>
	);
};

export default ThumbnailGenerator;
