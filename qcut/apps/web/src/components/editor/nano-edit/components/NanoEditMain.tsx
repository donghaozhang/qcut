import React, { useState, useCallback } from "react";
import { TRANSFORMATIONS, CUSTOM_PROMPT } from "../constants/transformations";
import type { Transformation } from "@/types/nano-edit";
import { FalAiService } from "@/services/ai/fal-ai-service";
import { useNanoEditStore } from "@/stores/editor/nano-edit-store";
import { useAsyncMediaStoreActions } from "@/hooks/media/use-async-media-store";
import { useParams } from "@tanstack/react-router";
import { createObjectURL } from "@/lib/media/blob-manager";
import { openInNewTab } from "@/lib/utils";
import TransformationSelector from "./TransformationSelector";
import ImageEditorCanvas from "./ImageEditorCanvas";
import MultiImageUploader from "./MultiImageUploader";
import { ResultDisplay } from "./ResultDisplay";
import { GeneratedContent } from "@/types/nano-edit";
import { dataUrlToFile, embedWatermark } from "../utils/fileUtils";
import LoadingSpinner from "@/components/ui/LoadingSpinner";

type ActiveTool = "mask" | "none";

const NanoEditMain: React.FC = () => {
	const { addAsset, isProcessing, setProcessing } = useNanoEditStore();
	const { addMediaItem } = useAsyncMediaStoreActions();
	const params = useParams({ from: "/editor/$project_id" });
	const projectId = params.project_id;

	const [transformations, setTransformations] =
		useState<Transformation[]>(TRANSFORMATIONS);
	const [selectedTransformation, setSelectedTransformation] =
		useState<Transformation | null>(null);
	const [primaryImageUrl, setPrimaryImageUrl] = useState<string | null>(null);
	const [primaryFile, setPrimaryFile] = useState<File | null>(null);
	const [secondaryImageUrl, setSecondaryImageUrl] = useState<string | null>(
		null
	);
	const [secondaryFile, setSecondaryFile] = useState<File | null>(null);
	const [generatedContent, setGeneratedContent] =
		useState<GeneratedContent | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [maskDataUrl, setMaskDataUrl] = useState<string | null>(null);
	const [customPrompt, setCustomPrompt] = useState<string>("");
	const [activeTool, setActiveTool] = useState<ActiveTool>("none");
	const [loadingMessage, setLoadingMessage] = useState<string>("");

	const handleSelectTransformation = (transformation: Transformation) => {
		setSelectedTransformation(transformation);
		setGeneratedContent(null);
		setError(null);
		if (transformation.prompt !== CUSTOM_PROMPT) {
			setCustomPrompt("");
		}
	};

	const handlePrimaryImageSelect = useCallback(
		(file: File, dataUrl: string) => {
			setPrimaryFile(file);
			setPrimaryImageUrl(dataUrl);
			setGeneratedContent(null);
			setError(null);
			setMaskDataUrl(null);
			setActiveTool("none");
		},
		[]
	);

	const handleSecondaryImageSelect = useCallback(
		(file: File, dataUrl: string) => {
			setSecondaryFile(file);
			setSecondaryImageUrl(dataUrl);
			setGeneratedContent(null);
			setError(null);
		},
		[]
	);

	const handleClearPrimaryImage = () => {
		setPrimaryImageUrl(null);
		setPrimaryFile(null);
		setGeneratedContent(null);
		setError(null);
		setMaskDataUrl(null);
		setActiveTool("none");
	};

	const handleClearSecondaryImage = () => {
		setSecondaryImageUrl(null);
		setSecondaryFile(null);
	};

	const handleGenerate = useCallback(async () => {
		if (!primaryImageUrl || !selectedTransformation) {
			setError("Please upload an image and select an effect.");
			return;
		}
		if (selectedTransformation.isMultiImage && !secondaryImageUrl) {
			setError("Please upload both required images.");
			return;
		}

		const promptToUse =
			selectedTransformation.prompt === CUSTOM_PROMPT
				? customPrompt
				: selectedTransformation.prompt;

		if (!promptToUse.trim()) {
			setError("Please enter a prompt describing the change you want to see.");
			return;
		}

		setProcessing(true);
		setError(null);
		setGeneratedContent(null);
		setLoadingMessage("Generating your masterpiece...");

		try {
			// Use editImages when we have an input image, generateImage for text-only
			let imageUrls: string[] = [];

			if (primaryImageUrl) {
				const inputs =
					selectedTransformation.isMultiImage && secondaryImageUrl
						? [primaryImageUrl, secondaryImageUrl]
						: [primaryImageUrl];
				imageUrls = await FalAiService.editImages(promptToUse, inputs, {
					num_images: 1,
				});
			} else {
				imageUrls = await FalAiService.generateImage(promptToUse, {
					image_size: { width: 1024, height: 1024 },
					num_images: 1,
				});
			}

			if (imageUrls.length > 0) {
				let finalImageUrl = imageUrls[0];

				// Add watermark
				try {
					finalImageUrl = await embedWatermark(
						finalImageUrl,
						"QCut｜Nano Edit"
					);
				} catch (watermarkError) {
					console.warn(
						"[NanoEditMain] Failed to add watermark:",
						watermarkError
					);
					// Continue with original image if watermark fails
				}

				// Convert to File for media library if needed
				let imageFile: File | undefined;
				try {
					const timestamp = Date.now();
					const filename = `nano-edit-${selectedTransformation.title.toLowerCase().replace(/\s+/g, "-")}-${timestamp}.png`;

					// Always use dataUrlToFile since finalImageUrl should be a data URL after watermarking
					imageFile = await dataUrlToFile(finalImageUrl, filename);
				} catch (fileError) {
					console.error("[NanoEditMain] Failed to create file:", fileError);
					// Don't throw here - just log the error and continue without adding to media library
					imageFile = undefined;
				}

				const result: GeneratedContent = {
					imageUrl: finalImageUrl,
					text: promptToUse,
					secondaryImageUrl: null,
				};

				setGeneratedContent(result);

				// Add to store as asset
				const getAssetType = (
					transformation: Transformation
				): "thumbnail" | "title-card" | "logo" | "overlay" => {
					if (transformation.title.toLowerCase().includes("thumbnail"))
						return "thumbnail";
					if (
						transformation.title.toLowerCase().includes("title") ||
						transformation.title.toLowerCase().includes("card")
					)
						return "title-card";
					if (transformation.title.toLowerCase().includes("logo"))
						return "logo";
					return "overlay"; // default for other transformations
				};

				const asset = {
					id: crypto.randomUUID(),
					type: getAssetType(selectedTransformation),
					url: finalImageUrl,
					projectId: undefined,
					createdAt: new Date(),
					prompt: promptToUse,
					dimensions: "1024x1024",
					transformation: selectedTransformation,
				};

				addAsset(asset);

				// Add to media library like adjustment panel does (only if file was created successfully)
				if (addMediaItem && projectId && imageFile) {
					try {
						const blobUrl = createObjectURL(imageFile, "nano-edit-result");

						// Get image dimensions
						const img = new Image();
						await new Promise((resolve, reject) => {
							img.onload = resolve;
							img.onerror = reject;
							img.src = finalImageUrl;
						});

						const mediaItem = {
							name: imageFile.name,
							type: "image" as const,
							file: imageFile,
							url: blobUrl,
							width: img.width || 1024,
							height: img.height || 1024,
							metadata: {
								source: "nano_edit",
								transformation: selectedTransformation.title,
								prompt: promptToUse,
								originalImage: primaryFile?.name,
							},
						};

						const newItemId = await addMediaItem(projectId, mediaItem);
						console.log(
							"[NanoEditMain] Added to media library with ID:",
							newItemId
						);
					} catch (mediaError) {
						console.error(
							"[NanoEditMain] Failed to add to media library:",
							mediaError
						);
						// Don't throw - the generation was successful even if media library failed
					}
				}
			} else {
				setError("No images were generated. Please try again.");
			}
		} catch (err) {
			console.error("[NanoEditMain] Generation failed:", err);
			setError(
				err instanceof Error ? err.message : "An unknown error occurred."
			);
		} finally {
			setProcessing(false);
			setLoadingMessage("");
		}
	}, [
		primaryImageUrl,
		secondaryImageUrl,
		selectedTransformation,
		customPrompt,
		addAsset,
		setProcessing,
		addMediaItem,
		projectId,
		primaryFile?.name,
	]);

	const handleUseImageAsInput = useCallback(async (imageUrl: string) => {
		if (!imageUrl) return;

		try {
			const newFile = await dataUrlToFile(imageUrl, `edited-${Date.now()}.png`);
			setPrimaryFile(newFile);
			setPrimaryImageUrl(imageUrl);
			setGeneratedContent(null);
			setError(null);
			setMaskDataUrl(null);
			setActiveTool("none");
			setSecondaryFile(null);
			setSecondaryImageUrl(null);
			setSelectedTransformation(null);
		} catch (err) {
			console.error("Failed to use image as input:", err);
			setError("Could not use the generated image as a new input.");
		}
	}, []);

	const handleBackToSelection = () => {
		setSelectedTransformation(null);
	};

	const toggleMaskTool = () => {
		setActiveTool((current) => (current === "mask" ? "none" : "mask"));
	};

	const isCustomPromptEmpty =
		selectedTransformation?.prompt === CUSTOM_PROMPT && !customPrompt.trim();
	const isSingleImageReady =
		!selectedTransformation?.isMultiImage && primaryImageUrl;
	const isMultiImageReady =
		selectedTransformation?.isMultiImage &&
		primaryImageUrl &&
		secondaryImageUrl;
	const isGenerateDisabled =
		isProcessing ||
		isCustomPromptEmpty ||
		(!isSingleImageReady && !isMultiImageReady);

	return (
		<div className="min-h-full bg-black text-gray-300">
			{selectedTransformation ? (
				<div className="container mx-auto p-4 md:p-8 animate-fade-in">
					<div className="mb-8">
						<button
							type="button"
							onClick={handleBackToSelection}
							className="flex items-center gap-2 text-yellow-500 hover:text-yellow-400 transition-colors duration-200 py-2 px-4 rounded-lg hover:bg-gray-900"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								className="h-5 w-5"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<title>Back arrow</title>
								<path
									fillRule="evenodd"
									d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
									clipRule="evenodd"
								/>
							</svg>
							Choose Another Effect
						</button>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
						{/* Input Column */}
						<div className="flex flex-col gap-6 p-6 bg-gray-950/60 backdrop-blur-lg rounded-xl border border-white/10 shadow-2xl shadow-black/20">
							<div>
								<div className="mb-4">
									<h2 className="text-xl font-semibold mb-1 text-yellow-500 flex items-center gap-3">
										<span className="text-3xl">
											{selectedTransformation.emoji}
										</span>
										{selectedTransformation.title}
									</h2>
									{selectedTransformation.prompt === CUSTOM_PROMPT ? (
										<textarea
											value={customPrompt}
											onChange={(e) => setCustomPrompt(e.target.value)}
											placeholder="e.g., 'make the sky a vibrant sunset' or 'add a small red boat on the water'"
											rows={3}
											className="w-full mt-2 p-3 bg-gray-900 border border-white/20 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-colors placeholder-gray-500"
										/>
									) : (
										<p className="text-gray-400">
											{selectedTransformation.description}
										</p>
									)}
								</div>

								{selectedTransformation.isMultiImage ? (
									<MultiImageUploader
										onPrimarySelect={handlePrimaryImageSelect}
										onSecondarySelect={handleSecondaryImageSelect}
										primaryImageUrl={primaryImageUrl}
										secondaryImageUrl={secondaryImageUrl}
										onClearPrimary={handleClearPrimaryImage}
										onClearSecondary={handleClearSecondaryImage}
										primaryTitle={selectedTransformation.primaryUploaderTitle}
										primaryDescription={
											selectedTransformation.primaryUploaderDescription
										}
										secondaryTitle={
											selectedTransformation.secondaryUploaderTitle
										}
										secondaryDescription={
											selectedTransformation.secondaryUploaderDescription
										}
									/>
								) : (
									<ImageEditorCanvas
										onImageSelect={handlePrimaryImageSelect}
										initialImageUrl={primaryImageUrl}
										onMaskChange={setMaskDataUrl}
										onClearImage={handleClearPrimaryImage}
										isMaskToolActive={activeTool === "mask"}
									/>
								)}

								{primaryImageUrl && !selectedTransformation.isMultiImage && (
									<div className="mt-4">
										<button
											type="button"
											onClick={toggleMaskTool}
											className={`w-full flex items-center justify-center gap-2 py-2 px-3 text-sm font-semibold rounded-md transition-colors duration-200 ${
												activeTool === "mask"
													? "bg-yellow-500 text-black"
													: "bg-gray-800 hover:bg-gray-700"
											}`}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												className="h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												strokeWidth="2"
											>
												<title>Mask tool</title>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z"
												/>
											</svg>
											<span>Draw Mask</span>
										</button>
									</div>
								)}

								<button
									type="button"
									onClick={handleGenerate}
									disabled={isGenerateDisabled}
									className="w-full mt-6 py-3 px-4 bg-yellow-500 text-black font-semibold rounded-lg shadow-lg shadow-yellow-500/20 hover:bg-yellow-400 disabled:bg-gray-800 disabled:text-gray-500 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
								>
									{isProcessing ? (
										<>
											<svg
												className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
												xmlns="http://www.w3.org/2000/svg"
												fill="none"
												viewBox="0 0 24 24"
											>
												<title>Loading</title>
												<circle
													className="opacity-25"
													cx="12"
													cy="12"
													r="10"
													stroke="currentColor"
													strokeWidth="4"
												/>
												<path
													className="opacity-75"
													fill="currentColor"
													d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
												/>
											</svg>
											<span>Generating...</span>
										</>
									) : (
										<>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												className="h-5 w-5"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<title>Generate</title>
												<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
											</svg>
											<span>Generate Image</span>
										</>
									)}
								</button>
							</div>
						</div>

						{/* Output Column */}
						<div className="flex flex-col p-6 bg-gray-950/60 backdrop-blur-lg rounded-xl border border-white/10 shadow-2xl shadow-black/20">
							<h2 className="text-xl font-semibold mb-4 text-yellow-500 self-start">
								Result
							</h2>
							{isProcessing && (
								<div className="flex-grow flex items-center justify-center">
									<LoadingSpinner message={loadingMessage} />
								</div>
							)}
							{error && (
								<div className="flex-grow flex items-center justify-center w-full">
									<div className="text-red-400 text-center p-4 bg-red-900/20 rounded-lg border border-red-500/20">
										{error}
									</div>
								</div>
							)}
							{!isProcessing && !error && generatedContent && (
								<ResultDisplay
									content={generatedContent}
									onUseImageAsInput={handleUseImageAsInput}
									onImageClick={openInNewTab}
									originalImageUrl={primaryImageUrl}
								/>
							)}
							{!isProcessing && !error && !generatedContent && (
								<div className="flex-grow flex flex-col items-center justify-center text-center text-gray-500">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										className="mx-auto h-12 w-12"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<title>Placeholder image</title>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
										/>
									</svg>
									<p className="mt-2">Your generated image will appear here.</p>
								</div>
							)}
						</div>
					</div>
				</div>
			) : (
				<TransformationSelector
					transformations={transformations}
					onSelect={handleSelectTransformation}
					hasPreviousResult={!!primaryImageUrl}
					onOrderChange={setTransformations}
				/>
			)}
		</div>
	);
};

export default NanoEditMain;
