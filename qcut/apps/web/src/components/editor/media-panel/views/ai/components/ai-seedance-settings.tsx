import { Checkbox } from "@/components/ui/checkbox";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { AI_MODELS, UPLOAD_CONSTANTS } from "../constants/ai-constants";
import {
	SEEDANCE_ASPECT_RATIOS,
	SEEDANCE_DURATION_OPTIONS,
	SEEDANCE_RESOLUTIONS,
	type SeedanceAspectRatio,
	type SeedanceDuration,
	type SeedanceResolution,
} from "../constants/ai-model-options";
import { calculateSeedanceCost } from "../utils/ai-cost-calculators";

export interface AiSeedanceSettingsProps {
	duration: SeedanceDuration;
	onDurationChange: (value: SeedanceDuration) => void;
	resolution: SeedanceResolution;
	onResolutionChange: (value: SeedanceResolution) => void;
	aspectRatio: SeedanceAspectRatio;
	onAspectRatioChange: (value: SeedanceAspectRatio) => void;
	cameraFixed: boolean;
	onCameraFixedChange: (value: boolean) => void;
	endFrameUrl: string | undefined;
	onEndFrameUrlChange: (value: string | undefined) => void;
	endFrameFile: File | null;
	endFramePreview: string | null;
	onEndFrameFileChange: (file: File | null, preview: string | null) => void;
	isProSelected: boolean;
	isRef2V?: boolean;
	selectedModelId?: string;
	isCompact: boolean;
	onError: (error: string | null) => void;
}

export function AiSeedanceSettings({
	duration,
	onDurationChange,
	resolution,
	onResolutionChange,
	aspectRatio,
	onAspectRatioChange,
	cameraFixed,
	onCameraFixedChange,
	endFrameUrl,
	onEndFrameUrlChange,
	endFrameFile,
	endFramePreview,
	onEndFrameFileChange,
	isProSelected,
	isRef2V = false,
	selectedModelId,
	isCompact,
	onError,
}: AiSeedanceSettingsProps) {
	const seedanceModelId =
		selectedModelId ??
		(isProSelected ? "seedance_pro_i2v" : "seedance_pro_fast_i2v");
	const seedanceModelConfig = AI_MODELS.find(
		(model) => model.id === seedanceModelId
	);
	const durationOptions =
		seedanceModelConfig?.supportedDurations ?? SEEDANCE_DURATION_OPTIONS;
	const resolutionOptions =
		seedanceModelConfig?.supportedResolutions ?? SEEDANCE_RESOLUTIONS;
	const aspectRatioOptions =
		seedanceModelConfig?.supportedAspectRatios ?? SEEDANCE_ASPECT_RATIOS;
	const estimatedCost = calculateSeedanceCost(
		seedanceModelId,
		resolution,
		duration
	);

	const handleEndFrameFileChange = ({
		file,
		preview,
	}: {
		file: File | null;
		preview: string | null;
	}) => {
		try {
			onEndFrameFileChange(file, preview);
			if (file) {
				onEndFrameUrlChange(undefined);
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to update end frame";
			onError(message);
		}
	};

	return (
		<div className="space-y-3 text-left border-t pt-3">
			<Label className="text-sm font-semibold">Seedance Settings</Label>

			<div className="grid gap-3 sm:grid-cols-2">
				<div className="space-y-1">
					<Label htmlFor="seedance-duration" className="text-xs">
						Duration
					</Label>
					<Select
						value={duration.toString()}
						onValueChange={(value) =>
							onDurationChange(Number(value) as SeedanceDuration)
						}
					>
						<SelectTrigger id="seedance-duration" className="h-8 text-xs">
							<SelectValue placeholder="Select duration" />
						</SelectTrigger>
						<SelectContent>
							{durationOptions.map((durationOption) => (
								<SelectItem
									key={durationOption}
									value={durationOption.toString()}
								>
									{durationOption} seconds
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-1">
					<Label htmlFor="seedance-resolution" className="text-xs">
						Resolution
					</Label>
					<Select
						value={resolution}
						onValueChange={(value) =>
							onResolutionChange(value as SeedanceResolution)
						}
					>
						<SelectTrigger id="seedance-resolution" className="h-8 text-xs">
							<SelectValue placeholder="Select resolution" />
						</SelectTrigger>
						<SelectContent>
							{resolutionOptions.map((resolutionOption) => (
								<SelectItem key={resolutionOption} value={resolutionOption}>
									{resolutionOption.toUpperCase()}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className="space-y-1">
				<Label htmlFor="seedance-aspect" className="text-xs">
					Aspect Ratio
				</Label>
				<Select
					value={aspectRatio}
					onValueChange={(value) =>
						onAspectRatioChange(value as SeedanceAspectRatio)
					}
				>
					<SelectTrigger id="seedance-aspect" className="h-8 text-xs">
						<SelectValue placeholder="Select aspect ratio" />
					</SelectTrigger>
					<SelectContent>
						{aspectRatioOptions.map((ratio) => (
							<SelectItem key={ratio} value={ratio}>
								{ratio.toUpperCase()}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{!isRef2V && (
				<div className="flex items-center space-x-2">
					<Checkbox
						id="seedance-camera-fixed"
						checked={cameraFixed}
						onCheckedChange={(checked) => onCameraFixedChange(Boolean(checked))}
					/>
					<Label htmlFor="seedance-camera-fixed" className="text-xs">
						Lock camera position
					</Label>
				</div>
			)}

			{isProSelected && !isRef2V && (
				<div className="space-y-2">
					<Label className="text-xs font-medium">End Frame (optional)</Label>
					<Input
						id="seedance-end-frame-url"
						type="url"
						value={endFrameUrl ?? ""}
						onChange={(event) =>
							onEndFrameUrlChange(event.target.value || undefined)
						}
						placeholder="https://example.com/final-frame.png"
						className="h-8 text-xs"
					/>
					<FileUpload
						id="seedance-end-frame-upload"
						label="Upload End Frame"
						helperText="Optional reference for the final frame"
						fileType="image"
						acceptedTypes={UPLOAD_CONSTANTS.ALLOWED_IMAGE_TYPES}
						maxSizeBytes={UPLOAD_CONSTANTS.MAX_IMAGE_SIZE_BYTES}
						maxSizeLabel={UPLOAD_CONSTANTS.MAX_IMAGE_SIZE_LABEL}
						formatsLabel={UPLOAD_CONSTANTS.IMAGE_FORMATS_LABEL}
						file={endFrameFile}
						preview={endFramePreview}
						onFileChange={(file, preview) =>
							handleEndFrameFileChange({
								file,
								preview: preview || null,
							})
						}
						onError={(error) => onError(error)}
						isCompact={isCompact}
					/>
				</div>
			)}

			<div className="text-xs text-muted-foreground">
				Estimated cost: ${estimatedCost.toFixed(2)}
			</div>
			<div className="text-xs text-muted-foreground">
				Seedance animates 2-12 second clips with reproducible seeds and optional
				end frames (Pro only).
			</div>
		</div>
	);
}
