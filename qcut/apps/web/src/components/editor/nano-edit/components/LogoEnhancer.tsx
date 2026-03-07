import React, { useState } from "react";
import { useNanoEditStore } from "@/stores/editor/nano-edit-store";
import { FalAiService } from "@/services/ai/fal-ai-service";
import { PromptInput } from "./PromptInput";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { openInNewTab } from "@/lib/utils";

export const LogoEnhancer: React.FC = () => {
	const { addAsset, isProcessing, assets, setProcessing } = useNanoEditStore();
	const [uploadedImage, setUploadedImage] = useState<string | null>(null);

	const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			const result = e.target?.result as string;
			setUploadedImage(result);
		};
		reader.readAsDataURL(file);
	};

	const handleGenerate = async (prompt: string) => {
		try {
			setProcessing(true);
			// For logo enhancement, we can generate variations or create new logos
			const enhancementPrompt = uploadedImage
				? `Enhance and improve this logo style: ${prompt}`
				: `Create a professional logo: ${prompt}`;

			const imageUrls = await FalAiService.generateImage(enhancementPrompt, {
				num_images: 1,
			});

			const firstUrl = imageUrls.at(0);
			if (!firstUrl) {
				console.warn("No images were generated");
				return;
			}

			const asset = {
				id: crypto.randomUUID(),
				type: "logo" as const,
				url: firstUrl,
				createdAt: new Date(),
				prompt,
			};

			addAsset(asset);
		} catch (error) {
			console.error("Error enhancing logo:", error);
			// TODO: route to app-level logger/toast
		} finally {
			setProcessing(false);
		}
	};

	const logoAssets = assets.filter((asset) => asset.type === "logo");

	return (
		<div className="bg-gray-800 rounded-lg p-4 space-y-4">
			{/* Header */}
			<div className="flex items-center gap-2">
				<div className="text-2xl">✨</div>
				<div>
					<h4 className="font-semibold text-white">Logo Enhancer</h4>
					<p className="text-sm text-gray-200">
						Create or enhance logos and brand assets
					</p>
				</div>
			</div>

			{/* File Upload (Optional) */}
			<div className="space-y-2">
				<label className="block text-sm font-medium text-gray-200">
					Upload Existing Logo (Optional)
				</label>
				<input
					type="file"
					accept="image/*"
					onChange={handleFileUpload}
					disabled={isProcessing}
					className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-sm file:bg-blue-600 file:text-white hover:file:bg-blue-700 disabled:opacity-50"
				/>
				{uploadedImage && (
					<div className="mt-2">
						<img
							src={uploadedImage}
							alt="Uploaded logo"
							className="w-16 h-16 object-contain rounded border border-gray-600"
						/>
					</div>
				)}
			</div>

			{/* Generation Form */}
			<PromptInput
				onGenerate={handleGenerate}
				placeholder={
					uploadedImage
						? "Describe how to enhance this logo: 'make it more modern', 'add gradient effects', etc."
						: "Describe your logo: 'tech startup logo', 'coffee shop emblem', 'gaming team badge', etc."
				}
				label={uploadedImage ? "Enhancement Instructions" : "Logo Description"}
			/>

			{/* Loading State */}
			{isProcessing && (
				<div className="flex justify-center py-4">
					<LoadingSpinner message="Processing logo..." />
				</div>
			)}

			{/* Generated Logos */}
			{logoAssets.length > 0 && (
				<div className="space-y-3">
					<h5 className="text-sm font-medium text-gray-200">
						Generated Logos ({logoAssets.length})
					</h5>
					<div className="grid grid-cols-3 gap-3">
						{logoAssets.slice(0, 6).map((asset) => (
							<div key={asset.id} className="relative group">
								<div className="w-full h-20 bg-gray-700 rounded border border-gray-600 group-hover:border-blue-500 transition-colors flex items-center justify-center">
									<button
										type="button"
										onClick={() => openInNewTab(asset.url)}
										className="flex items-center justify-center w-full h-full"
										aria-label="Open generated logo in new tab"
									>
										<img
											src={asset.url}
											alt="Generated logo"
											className="max-w-full max-h-full object-contain"
										/>
									</button>
								</div>
								<div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded transition-colors" />
								{asset.prompt && (
									<div className="absolute bottom-1 left-1 right-1 text-xs text-white bg-black/70 px-1 py-0.5 rounded truncate opacity-0 group-hover:opacity-100 transition-opacity">
										{asset.prompt}
									</div>
								)}
							</div>
						))}
					</div>
					{logoAssets.length > 6 && (
						<div className="text-xs text-gray-200 text-center">
							+{logoAssets.length - 6} more logos
						</div>
					)}
				</div>
			)}

			{/* Tips */}
			<div className="text-xs text-gray-200 bg-gray-900 p-3 rounded">
				<strong>💡 Tips:</strong>{" "}
				{uploadedImage
					? "Describe specific improvements or style changes you want to see."
					: "Be specific about industry, style, and colors. Examples: 'minimalist tech company', 'vintage coffee shop'"}
			</div>
		</div>
	);
};

export default LogoEnhancer;
