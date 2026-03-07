import React from "react";
import { useNanoEditStore } from "@/stores/editor/nano-edit-store";
import { FalAiService } from "@/services/ai/fal-ai-service";
import { PromptInput } from "./PromptInput";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

export const TitleCardCreator: React.FC = () => {
	const { addAsset, isProcessing, assets, setProcessing } = useNanoEditStore();

	const handleGenerate = async (prompt: string) => {
		try {
			setProcessing(true);
			const imageUrls = await FalAiService.generateImage(
				`Professional title card design: ${prompt}`,
				{
					num_images: 1,
				}
			);

			const firstUrl = imageUrls.at(0);
			if (!firstUrl) return;

			const asset = {
				id: crypto.randomUUID(),
				type: "title-card" as const,
				url: firstUrl,
				createdAt: new Date(),
				prompt,
			};

			addAsset(asset);
		} catch (error) {
			console.error("Error generating title card:", error);
			// TODO: route to app-level logger/toast
		} finally {
			setProcessing(false);
		}
	};

	const titleCardAssets = assets.filter((asset) => asset.type === "title-card");

	return (
		<div className="bg-gray-800 rounded-lg p-4 space-y-4">
			{/* Header */}
			<div className="flex items-center gap-2">
				<div className="text-2xl">🎬</div>
				<div>
					<h4 className="font-semibold text-white">Title Card Creator</h4>
					<p className="text-sm text-gray-200">
						Design professional title cards and intros
					</p>
				</div>
			</div>

			{/* Generation Form */}
			<PromptInput
				onGenerate={handleGenerate}
				placeholder="Describe your title card: 'minimalist tech podcast intro', 'vibrant music video title', etc."
				label="Title Card Style"
			/>

			{/* Loading State */}
			{isProcessing && (
				<div className="flex justify-center py-4">
					<LoadingSpinner message="Creating title card..." />
				</div>
			)}

			{/* Generated Title Cards */}
			{titleCardAssets.length > 0 && (
				<div className="space-y-3">
					<h5 className="text-sm font-medium text-gray-200">
						Generated Title Cards ({titleCardAssets.length})
					</h5>
					<div className="grid grid-cols-1 gap-3">
						{titleCardAssets.slice(0, 3).map((asset) => (
							<div key={asset.id} className="relative group">
								<a
									href={asset.url}
									target="_blank"
									rel="noopener noreferrer"
									className="block"
								>
									<img
										src={asset.url}
										alt={asset.prompt || "Title card"}
										className="w-full h-24 object-cover rounded border border-gray-600 group-hover:border-blue-500 transition-colors"
										loading="lazy"
									/>
									<div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded transition-colors" />
								</a>
								{asset.prompt && (
									<div className="absolute bottom-1 left-1 right-1 text-xs text-white bg-black/70 px-2 py-1 rounded truncate opacity-0 group-hover:opacity-100 transition-opacity">
										{asset.prompt}
									</div>
								)}
							</div>
						))}
					</div>
					{titleCardAssets.length > 3 && (
						<div className="text-xs text-gray-200 text-center">
							+{titleCardAssets.length - 3} more title cards
						</div>
					)}
				</div>
			)}

			{/* Tips */}
			<div className="text-xs text-gray-200 bg-gray-900 p-3 rounded">
				<strong>💡 Tips:</strong> Include style preferences, colors, and mood.
				Examples: "dark cinematic style", "bright corporate design", "retro 80s
				aesthetic"
			</div>
		</div>
	);
};

export default TitleCardCreator;
