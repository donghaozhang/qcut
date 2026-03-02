"use client";

import React, { useState } from "react";
import { BlobImage } from "@/components/ui/blob-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Loader2,
	Image as ImageIcon,
	Download,
	RefreshCw,
	Wand2,
	ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useText2ImageStore } from "@/stores/ai/text2image-store";
import {
	TEXT2IMAGE_MODELS,
	TEXT2IMAGE_MODEL_ORDER,
} from "@/lib/ai-models/text2image-models";
import {
	UPSCALE_MODEL_ORDER,
	UPSCALE_MODELS,
} from "@/lib/ai-models/upscale-models";
import {
	FloatingActionPanelRoot,
	FloatingActionPanelTrigger,
	FloatingActionPanelContent,
	FloatingActionPanelModelOption,
} from "@/components/ui/floating-action-panel";
import { FileUpload } from "@/components/ui/file-upload";
import { ModelTypeSelector } from "./model-type-selector";
import { UpscaleSettingsPanel } from "./upscale-settings";
import { useUpscaleGeneration } from "./use-upscale-generation";
import { AiView } from "./ai";
import { AdjustmentPanel } from "@/components/editor/adjustment";
import { CameraSelectorView } from "./camera-selector";
import DrawView from "./draw";
import { UPLOAD_CONSTANTS } from "./ai/constants/ai-constants";
import {
	getProviderLogo,
	getProviderName,
} from "./ai/constants/model-provider-logos";

// Debug flag - set to false to disable console logs
const DEBUG_TEXT2IMAGE = import.meta.env.DEV && false;

/** AI Images panel with generation, upscale, angles, adjustment, and camera sub-views. */
export function Text2ImageView() {
	if (DEBUG_TEXT2IMAGE) console.log("Text2ImageView rendered");

	const {
		prompt,
		setPrompt,
		selectedModels,
		setModelSelection,
		selectModels,
		generationMode,
		setGenerationMode,
		isGenerating,
		generateImages,
		generationResults,
		selectedResults,
		toggleResultSelection,
		addSelectedToMedia,
		clearResults,
		modelType,
		setModelType,
		upscaleSettings,
		setUpscaleSettings,
		isUpscaling,
	} = useText2ImageStore();

	if (DEBUG_TEXT2IMAGE) {
		console.log("Text2ImageView store state:", {
			prompt,
			selectedModels,
			generationMode,
			isGenerating,
			hasResults: Object.keys(generationResults).length > 0,
		});

		console.log("Available models:", Object.keys(TEXT2IMAGE_MODELS));
	}

	const [imageSize, setImageSize] = useState("square_hd");
	const [seed, setSeed] = useState("");
	const [upscaleImageFile, setUpscaleImageFile] = useState<File | null>(null);
	const [upscaleImagePreview, setUpscaleImagePreview] = useState<string | null>(
		null
	);
	const [localUpscaleError, setLocalUpscaleError] = useState<string | null>(
		null
	);

	const {
		handleUpscale,
		isProcessing: isUpscaleProcessing,
		progress: upscaleProgress,
		error: upscaleError,
		resultUrl: upscaleResultUrl,
		reset: resetUpscaleResult,
	} = useUpscaleGeneration();

	const selectedUpscaleModel = UPSCALE_MODELS[upscaleSettings.selectedModel];

	const selectedModelCount = selectedModels.length;
	const hasResults = Object.keys(generationResults).length > 0;
	const selectedResultCount = selectedResults.length;
	const isUpscaleRunning = isUpscaling || isUpscaleProcessing;
	const combinedUpscaleError = localUpscaleError || upscaleError;
	const canUpscale = Boolean(upscaleImageFile) && !isUpscaleRunning;

	const handleUpscaleImageChange = (
		file: File | null,
		preview?: string | null
	) => {
		setUpscaleImageFile(file);
		setUpscaleImagePreview(preview ?? null);
		setLocalUpscaleError(null);
		if (!file) {
			resetUpscaleResult();
		}
	};

	const handleUpscaleSubmit = async () => {
		if (!upscaleImageFile) {
			setLocalUpscaleError("Please upload an image to upscale.");
			return;
		}
		setLocalUpscaleError(null);
		try {
			await handleUpscale(upscaleImageFile);
		} catch (error) {
			if (DEBUG_TEXT2IMAGE) console.error("Upscale failed:", error);
		}
	};

	const handleGenerate = async () => {
		if (!prompt.trim()) {
			if (DEBUG_TEXT2IMAGE) console.log("No prompt provided");
			return;
		}

		if (DEBUG_TEXT2IMAGE) {
			console.log("Starting generation with:", {
				prompt,
				selectedModels,
				imageSize,
				seed,
			});
		}

		const settings = {
			imageSize,
			seed: seed ? parseInt(seed, 10) : undefined,
		};

		try {
			await generateImages(prompt, settings);
			console.log("Generation completed");
		} catch (error) {
			console.error("Generation failed:", error);
		}
	};

	const handleAddToMedia = () => {
		addSelectedToMedia();
		clearResults();
	};

	// Draw mode needs a full-height layout with no overflow clipping
	// so tldraw's floating toolbar / style panel / menus render correctly
	if (modelType === "draw") {
		return (
			<div className="h-full flex flex-col overflow-hidden">
				<div className="p-4 pb-2 shrink-0">
					<ModelTypeSelector
						selected={modelType}
						onChange={setModelType}
						className="flex-1"
					/>
				</div>
				<div className="flex-1 min-h-0 relative">
					<DrawView />
				</div>
			</div>
		);
	}

	return (
		<div className="p-4 space-y-6">
			<div className="flex items-center justify-between">
				<ModelTypeSelector
					selected={modelType}
					onChange={setModelType}
					className="flex-1"
				/>
				<div className="flex items-center gap-1.5 ml-2 shrink-0">
					<a
						href="https://opennana.com/awesome-prompt-gallery"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 rounded transition-colors"
					>
						Prompts
						<ExternalLink className="h-2.5 w-2.5" />
					</a>
					<a
						href="https://prompthero.com/"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 rounded transition-colors"
					>
						PromptHero
						<ExternalLink className="h-2.5 w-2.5" />
					</a>
				</div>
			</div>
			{modelType === "generation" && (
				<>
					{/* Generate Button */}
					<Button
						onClick={handleGenerate}
						disabled={
							!prompt.trim() || selectedModelCount === 0 || isGenerating
						}
						className="w-full"
						size="lg"
					>
						{isGenerating ? (
							<>
								<Loader2 className="w-4 h-4 mr-2 animate-spin" />
								Generating...
							</>
						) : (
							<>
								<Wand2 className="w-4 h-4 mr-2" />
								{generationMode === "single"
									? "Generate Image"
									: `Generate with ${selectedModelCount} Model${selectedModelCount !== 1 ? "s" : ""}`}
							</>
						)}
					</Button>

					{/* Mode Selection */}
					<Card className="border-0 shadow-none" style={{ marginTop: "5px" }}>
						<CardHeader className="pb-3">
							<CardTitle className="text-sm">Generation Mode</CardTitle>
							<div style={{ height: "6px" }} />
						</CardHeader>
						<CardContent>
							<RadioGroup
								value={generationMode}
								onValueChange={(value: "single" | "multi") =>
									setGenerationMode(value)
								}
								className="flex flex-col gap-1.5"
							>
								<div className="flex items-center space-x-2 cursor-pointer">
									<RadioGroupItem
										value="single"
										id="single"
										className="h-3 w-3"
									/>
									<Label htmlFor="single" className="text-xs cursor-pointer">
										Single Model
									</Label>
								</div>
								<div className="flex items-center space-x-2 cursor-pointer">
									<RadioGroupItem
										value="multi"
										id="multi"
										className="h-3 w-3"
									/>
									<Label htmlFor="multi" className="text-xs cursor-pointer">
										Multi-Model Compare
									</Label>
								</div>
							</RadioGroup>
						</CardContent>
					</Card>

					{/* Model Selection */}
					<Card className="border-0 shadow-none">
						<CardHeader className="pb-2 pt-3">
							<CardTitle className="text-sm">
								{generationMode === "single"
									? "Select Model"
									: `Select Models (${selectedModelCount} chosen)`}
							</CardTitle>
						</CardHeader>
						<CardContent className="pt-0">
							<FloatingActionPanelRoot defaultMode="selection">
								{({ mode, open }) => (
									<div>
										<FloatingActionPanelTrigger
											mode="selection"
											title="Click to select AI models"
											className="w-full !bg-transparent hover:!bg-transparent border border-input h-8 text-xs"
										>
											{selectedModelCount === 0
												? "Click to choose"
												: generationMode === "single" && selectedModels[0]
													? TEXT2IMAGE_MODELS[selectedModels[0]]?.name
													: "Click to change selection"}
										</FloatingActionPanelTrigger>

										{open && (
											<div className="w-full border rounded-md bg-background/90 backdrop-blur-sm max-h-[250px] overflow-y-auto shadow-md mt-1">
												<div className="p-2 space-y-1">
													{TEXT2IMAGE_MODEL_ORDER.map((modelId) => {
														const model = TEXT2IMAGE_MODELS[modelId];
														const isSelected = selectedModels.includes(modelId);
														return (
															<FloatingActionPanelModelOption
																key={modelId}
																id={modelId}
																name={model.name}
																logo={getProviderLogo(modelId)}
																checked={isSelected}
																onCheckedChange={(checked) => {
																	if (generationMode === "single") {
																		if (checked) {
																			selectModels([modelId]);
																		} else {
																			selectModels([]);
																		}
																		return;
																	}

																	setModelSelection(modelId, checked);
																}}
															/>
														);
													})}
												</div>
											</div>
										)}
									</div>
								)}
							</FloatingActionPanelRoot>
						</CardContent>
					</Card>

					{/* Prompt Input */}
					<Card className="border-0 shadow-none" style={{ marginTop: "5px" }}>
						<CardHeader className="pb-3">
							<CardTitle className="text-sm">Prompt</CardTitle>
							<div style={{ height: "5px" }} />
						</CardHeader>
						<CardContent>
							<Textarea
								placeholder="Describe the image you want to generate..."
								value={prompt}
								onChange={(e) => setPrompt(e.target.value)}
								className="min-h-[100px] resize-none"
							/>
						</CardContent>
					</Card>

					{/* Settings */}
					<Card className="border-0 shadow-none" style={{ marginTop: "5px" }}>
						<CardHeader className="pb-3">
							<CardTitle className="text-sm" style={{ marginLeft: "5px" }}>
								Settings
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<Label htmlFor="size" className="text-xs">
										Image Size
									</Label>
									<div style={{ height: "5px" }} />
									<Select value={imageSize} onValueChange={setImageSize}>
										<SelectTrigger
											id="size"
											className="justify-between text-foreground"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent className="z-[9999] bg-background border shadow-lg">
											<SelectItem value="square" className="text-foreground">
												Square
											</SelectItem>
											<SelectItem value="square_hd" className="text-foreground">
												Square HD
											</SelectItem>
											<SelectItem
												value="landscape_4_3"
												className="text-foreground"
											>
												Landscape (4:3)
											</SelectItem>
											<SelectItem
												value="landscape_16_9"
												className="text-foreground"
											>
												Landscape (16:9)
											</SelectItem>
											<SelectItem
												value="portrait_3_4"
												className="text-foreground"
											>
												Portrait (3:4)
											</SelectItem>
											<SelectItem
												value="portrait_9_16"
												className="text-foreground"
											>
												Portrait (9:16)
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div>
									<Label htmlFor="seed" className="text-xs">
										Seed (Optional)
									</Label>
									<Input
										id="seed"
										placeholder="Random"
										value={seed}
										onChange={(e) => setSeed(e.target.value)}
										type="number"
									/>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Results */}
					{hasResults && (
						<Card>
							<CardHeader className="pb-3">
								<div className="flex items-center justify-between">
									<CardTitle className="text-sm">
										{generationMode === "single"
											? "Generated Image"
											: "Compare Results"}
									</CardTitle>
									<Button
										variant="outline"
										size="sm"
										onClick={clearResults}
										className="text-xs"
									>
										<RefreshCw className="w-3 h-3 mr-1" />
										Clear
									</Button>
								</div>
							</CardHeader>
							<CardContent>
								{generationMode === "single" ? (
									// Single result
									<div className="space-y-4">
										{Object.entries(generationResults).map(
											([modelKey, result]) => (
												<div key={modelKey} className="space-y-2">
													{result.status === "loading" && (
														<div className="flex items-center justify-center p-8 border-2 border-dashed rounded-lg">
															<div className="text-center">
																<Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
																<p className="text-sm text-muted-foreground">
																	Generating with{" "}
																	{TEXT2IMAGE_MODELS[modelKey]?.name}
																	...
																</p>
															</div>
														</div>
													)}
													{result.status === "success" && result.imageUrl && (
														<div className="space-y-2">
															<BlobImage
																src={result.imageUrl}
																alt="Generated artwork"
																className="w-full rounded-lg border"
																crossOrigin="anonymous"
															/>
															<Button
																onClick={() =>
																	addSelectedToMedia([
																		{
																			modelKey,
																			imageUrl: result.imageUrl!,
																			prompt,
																			settings: {
																				imageSize,
																				seed: seed
																					? parseInt(seed, 10)
																					: undefined,
																			},
																			mode: "generation",
																		},
																	])
																}
																className="w-full"
																variant="outline"
															>
																<Download className="w-4 h-4 mr-2" />
																Add to Media Panel
															</Button>
														</div>
													)}
													{result.status === "error" && (
														<div className="p-4 border-2 border-red-200 rounded-lg bg-red-50">
															<p className="text-sm text-red-800">
																Failed to generate with{" "}
																{TEXT2IMAGE_MODELS[modelKey]?.name}:{" "}
																{result.error}
															</p>
														</div>
													)}
												</div>
											)
										)}
									</div>
								) : (
									// Multi-model comparison
									<div className="space-y-4">
										<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
											{Object.entries(generationResults).map(
												([modelKey, result]) => (
													<div
														key={modelKey}
														className="border rounded-lg overflow-hidden"
													>
														<div className="p-3 bg-muted">
															<div className="flex items-center justify-between">
																<h4 className="text-sm font-medium">
																	{TEXT2IMAGE_MODELS[modelKey]?.name}
																</h4>
																{result.status === "success" &&
																	result.imageUrl && (
																		<Checkbox
																			checked={selectedResults.some(
																				(r) => r.modelKey === modelKey
																			)}
																			onCheckedChange={() =>
																				toggleResultSelection({
																					modelKey,
																					imageUrl: result.imageUrl!,
																					prompt,
																					settings: {
																						imageSize,
																						seed: seed
																							? parseInt(seed, 10)
																							: undefined,
																					},
																					mode: "generation",
																				})
																			}
																		/>
																	)}
															</div>
														</div>
														<div className="aspect-square bg-muted">
															{result.status === "loading" && (
																<div className="flex items-center justify-center h-full">
																	<div className="text-center">
																		<Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
																		<p className="text-xs text-muted-foreground">
																			Generating...
																		</p>
																	</div>
																</div>
															)}
															{result.status === "success" &&
																result.imageUrl && (
																	<BlobImage
																		src={result.imageUrl}
																		alt={`Generated by ${TEXT2IMAGE_MODELS[modelKey]?.name}`}
																		className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
																		crossOrigin="anonymous"
																		onClick={() =>
																			toggleResultSelection({
																				modelKey,
																				imageUrl: result.imageUrl!,
																				prompt,
																				settings: {
																					imageSize,
																					seed: seed
																						? parseInt(seed, 10)
																						: undefined,
																				},
																				mode: "generation",
																			})
																		}
																	/>
																)}
															{result.status === "error" && (
																<div className="flex items-center justify-center h-full p-4">
																	<p className="text-xs text-red-600 text-center">
																		Generation failed: {result.error}
																	</p>
																</div>
															)}
														</div>
													</div>
												)
											)}
										</div>

										{selectedResultCount > 0 && (
											<Button
												onClick={handleAddToMedia}
												className="w-full"
												size="lg"
											>
												<Download className="w-4 h-4 mr-2" />
												Add {selectedResultCount} Selected Image
												{selectedResultCount !== 1 ? "s" : ""} to Media Panel
											</Button>
										)}
									</div>
								)}
							</CardContent>
						</Card>
					)}
				</>
			)}
			{modelType === "angles" && <AiView mode="angles" />}
			{modelType === "adjustment" && <AdjustmentPanel />}
			{modelType === "camera" && <CameraSelectorView />}

			{modelType === "upscale" && (
				<div className="space-y-4" data-testid="upscale-panel">
					<Card className="border-0 shadow-none">
						<CardHeader className="pb-2 pt-3">
							<CardTitle className="text-sm">Select Upscale Model</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							{UPSCALE_MODEL_ORDER.map((modelId) => {
								const model = UPSCALE_MODELS[modelId];
								const isSelected = upscaleSettings.selectedModel === modelId;
								return (
									<button
										key={modelId}
										type="button"
										onClick={() =>
											setUpscaleSettings({ selectedModel: modelId })
										}
										className={cn(
											"w-full rounded-lg border p-3 text-left transition-colors",
											isSelected
												? "border-primary bg-primary/5"
												: "border-muted-foreground/20 hover:border-primary/40"
										)}
										data-testid={`upscale-model-option-${modelId}`}
									>
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												{(() => {
													const logo = getProviderLogo(modelId);
													return logo ? (
														<img
															src={logo}
															alt={`${getProviderName(modelId)} logo`}
															className="w-4 h-4 shrink-0 rounded-sm"
														/>
													) : null;
												})()}
												<p className="text-sm font-medium">{model.name}</p>
											</div>
											<Badge variant={isSelected ? "default" : "outline"}>
												{model.estimatedCost}
											</Badge>
										</div>
									</button>
								);
							})}
						</CardContent>
					</Card>

					<Card className="border-0 shadow-none">
						<CardHeader className="pb-2 pt-3">
							<CardTitle className="text-sm">Upscale Settings</CardTitle>
						</CardHeader>
						<CardContent className="pt-0">
							<UpscaleSettingsPanel />
						</CardContent>
					</Card>

					<Card className="border-0 shadow-none">
						<CardHeader className="pb-2 pt-3">
							<CardTitle className="text-sm">Source Image</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<FileUpload
								id="upscale-image-input"
								label="Image to Upscale"
								helperText="Required"
								fileType="image"
								acceptedTypes={UPLOAD_CONSTANTS.ALLOWED_IMAGE_TYPES}
								maxSizeBytes={UPLOAD_CONSTANTS.MAX_IMAGE_SIZE_BYTES}
								maxSizeLabel={UPLOAD_CONSTANTS.MAX_IMAGE_SIZE_LABEL}
								formatsLabel={UPLOAD_CONSTANTS.IMAGE_FORMATS_LABEL}
								file={upscaleImageFile}
								preview={upscaleImagePreview}
								onFileChange={handleUpscaleImageChange}
								onError={(message) => setLocalUpscaleError(message)}
								isCompact
							/>

							{combinedUpscaleError && (
								<p className="text-xs text-destructive">
									{combinedUpscaleError}
								</p>
							)}

							<Button
								onClick={handleUpscaleSubmit}
								disabled={!canUpscale}
								className="w-full"
								size="lg"
								data-testid="upscale-image-button"
							>
								{isUpscaleRunning ? (
									<>
										<Loader2 className="w-4 h-4 mr-2 animate-spin" />
										Upscaling...
									</>
								) : (
									<>
										<Wand2 className="w-4 h-4 mr-2" />
										Upscale Image
									</>
								)}
							</Button>

							{isUpscaleRunning && (
								<div className="space-y-2">
									<Progress value={upscaleProgress} className="h-2" />
									<p className="text-xs text-muted-foreground text-right">
										{Math.round(upscaleProgress)}%
									</p>
								</div>
							)}

							{upscaleResultUrl && (
								<div className="space-y-2" data-testid="upscale-result-preview">
									<Label className="text-xs">Latest Result</Label>
									<BlobImage
										src={upscaleResultUrl}
										alt={`Upscaled with ${selectedUpscaleModel.name}`}
										className="w-full rounded-lg border"
										crossOrigin="anonymous"
									/>
									<p className="text-[10px] text-muted-foreground">
										Added automatically to the media panel.
									</p>
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
}
