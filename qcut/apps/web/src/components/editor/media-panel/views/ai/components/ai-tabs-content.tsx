import { TabsContent } from "@/components/ui/tabs";
import { AITextTab } from "../tabs/ai-text-tab";
import { AIImageTab } from "../tabs/ai-image-tab";
import { AIAvatarTab } from "../tabs/ai-avatar-tab";
import { AIUpscaleTab } from "../tabs/ai-upscale-tab";
import { AIAnglesTab } from "../tabs/ai-angles-tab";
import type { useTextTabState } from "../hooks/use-ai-text-tab-state";
import type { useImageTabState } from "../hooks/use-ai-image-tab-state";
import type { useAvatarTabState } from "../hooks/use-ai-avatar-tab-state";
import type { useUpscaleTabState } from "../hooks/use-ai-upscale-tab-state";
import type { useAnglesTabState } from "../hooks/use-ai-angles-tab-state";
import type { T2VModelCapabilities } from "../constants/text2video-models-config";

interface AITabsContentProps {
	prompt: string;
	setPrompt: (prompt: string) => void;
	maxChars: number;
	selectedModels: string[];
	isCompact: boolean;
	setError: (error: string | null) => void;
	textTabState: ReturnType<typeof useTextTabState>;
	imageTabState: ReturnType<typeof useImageTabState>;
	avatarTabState: ReturnType<typeof useAvatarTabState>;
	upscaleTabState: ReturnType<typeof useUpscaleTabState>;
	anglesTabState: ReturnType<typeof useAnglesTabState>;
	combinedCapabilities: T2VModelCapabilities;
	generation: {
		isSora2Selected: boolean;
		setFirstFrame?: (file: File | null) => void;
		setLastFrame?: (file: File | null) => void;
	};
	bytedanceEstimatedCost: string;
	flashvsrEstimatedCost: string;
}

export function AITabsContent({
	prompt,
	setPrompt,
	maxChars,
	selectedModels,
	isCompact,
	setError,
	textTabState,
	imageTabState,
	avatarTabState,
	upscaleTabState,
	anglesTabState,
	combinedCapabilities,
	generation,
	bytedanceEstimatedCost,
	flashvsrEstimatedCost,
}: AITabsContentProps) {
	const {
		state: textState,
		setters: textSetters,
		helpers: textHelpers,
	} = textTabState;
	const {
		state: imageState,
		setters: imageSetters,
		helpers: imageHelpers,
	} = imageTabState;
	const { state: avatarState, setters: avatarSetters } = avatarTabState;
	const {
		state: upscaleState,
		setters: upscaleSetters,
		handlers: upscaleHandlers,
	} = upscaleTabState;

	return (
		<>
			{/* Text Tab */}
			<TabsContent value="text" className="space-y-4">
				<AITextTab
					prompt={prompt}
					onPromptChange={setPrompt}
					maxChars={maxChars}
					selectedModels={selectedModels}
					isCompact={isCompact}
					combinedCapabilities={combinedCapabilities}
					isSora2Selected={generation.isSora2Selected}
					t2vSettingsExpanded={textState.t2vSettingsExpanded}
					onT2vSettingsExpandedChange={textSetters.setT2vSettingsExpanded}
					t2vAspectRatio={textState.t2vAspectRatio}
					onT2vAspectRatioChange={textSetters.setT2vAspectRatio}
					t2vResolution={textState.t2vResolution}
					onT2vResolutionChange={textSetters.setT2vResolution}
					t2vDuration={textState.t2vDuration}
					onT2vDurationChange={textSetters.setT2vDuration}
					t2vNegativePrompt={textState.t2vNegativePrompt}
					onT2vNegativePromptChange={textSetters.setT2vNegativePrompt}
					t2vPromptExpansion={textState.t2vPromptExpansion}
					onT2vPromptExpansionChange={textSetters.setT2vPromptExpansion}
					t2vSeed={textState.t2vSeed}
					onT2vSeedChange={textSetters.setT2vSeed}
					t2vSafetyChecker={textState.t2vSafetyChecker}
					onT2vSafetyCheckerChange={textSetters.setT2vSafetyChecker}
					activeSettingsCount={textHelpers.activeSettingsCount}
					hailuoT2VDuration={textState.hailuoT2VDuration}
					onHailuoT2VDurationChange={textSetters.setHailuoT2VDuration}
					ltxv2Duration={textState.ltxv2Duration}
					onLTXV2DurationChange={textSetters.setLTXV2Duration}
					ltxv2Resolution={textState.ltxv2Resolution}
					onLTXV2ResolutionChange={textSetters.setLTXV2Resolution}
					ltxv2FPS={textState.ltxv2FPS}
					onLTXV2FPSChange={textSetters.setLTXV2FPS}
					ltxv2GenerateAudio={textState.ltxv2GenerateAudio}
					onLTXV2GenerateAudioChange={textSetters.setLTXV2GenerateAudio}
					ltxv2FastDuration={textState.ltxv2FastDuration}
					onLTXV2FastDurationChange={textSetters.setLTXV2FastDuration}
					ltxv2FastResolution={textState.ltxv2FastResolution}
					onLTXV2FastResolutionChange={textSetters.setLTXV2FastResolution}
					ltxv2FastFPS={textState.ltxv2FastFPS}
					onLTXV2FastFPSChange={textSetters.setLTXV2FastFPS}
					ltxv2FastGenerateAudio={textState.ltxv2FastGenerateAudio}
					onLTXV2FastGenerateAudioChange={textSetters.setLTXV2FastGenerateAudio}
				/>
			</TabsContent>

			{/* Image Tab */}
			<TabsContent value="image" className="space-y-4">
				<AIImageTab
					prompt={prompt}
					onPromptChange={setPrompt}
					maxChars={maxChars}
					selectedModels={selectedModels}
					isCompact={isCompact}
					onError={setError}
					firstFrame={imageState.firstFrame}
					firstFramePreview={imageState.firstFramePreview}
					lastFrame={imageState.lastFrame}
					lastFramePreview={imageState.lastFramePreview}
					imageTabSourceVideo={imageState.imageTabSourceVideo}
					onFirstFrameChange={(file, preview) => {
						imageSetters.setFirstFrame(file);
						if (generation.setFirstFrame) {
							generation.setFirstFrame(file);
						}
					}}
					onLastFrameChange={(file, preview) => {
						imageSetters.setLastFrame(file);
						if (generation.setLastFrame) {
							generation.setLastFrame(file);
						}
					}}
					onSourceVideoChange={(file) => {
						imageSetters.setImageTabSourceVideo(file);
						if (file) setError(null);
					}}
					viduQ2Duration={imageState.viduQ2.duration}
					onViduQ2DurationChange={imageSetters.setViduQ2Duration}
					viduQ2Resolution={imageState.viduQ2.resolution}
					onViduQ2ResolutionChange={imageSetters.setViduQ2Resolution}
					viduQ2MovementAmplitude={imageState.viduQ2.movementAmplitude}
					onViduQ2MovementAmplitudeChange={
						imageSetters.setViduQ2MovementAmplitude
					}
					viduQ2EnableBGM={imageState.viduQ2.enableBGM}
					onViduQ2EnableBGMChange={imageSetters.setViduQ2EnableBGM}
					ltxv2I2VDuration={imageState.ltxv2I2V.duration}
					onLTXV2I2VDurationChange={imageSetters.setLTXV2I2VDuration}
					ltxv2I2VResolution={imageState.ltxv2I2V.resolution}
					onLTXV2I2VResolutionChange={imageSetters.setLTXV2I2VResolution}
					ltxv2I2VFPS={imageState.ltxv2I2V.fps}
					onLTXV2I2VFPSChange={imageSetters.setLTXV2I2VFPS}
					ltxv2I2VGenerateAudio={imageState.ltxv2I2V.generateAudio}
					onLTXV2I2VGenerateAudioChange={imageSetters.setLTXV2I2VGenerateAudio}
					ltxv2ImageDuration={imageState.ltxv2Image.duration}
					onLTXV2ImageDurationChange={imageSetters.setLTXV2ImageDuration}
					ltxv2ImageResolution={imageState.ltxv2Image.resolution}
					onLTXV2ImageResolutionChange={imageSetters.setLTXV2ImageResolution}
					ltxv2ImageFPS={imageState.ltxv2Image.fps}
					onLTXV2ImageFPSChange={imageSetters.setLTXV2ImageFPS}
					ltxv2ImageGenerateAudio={imageState.ltxv2Image.generateAudio}
					onLTXV2ImageGenerateAudioChange={
						imageSetters.setLTXV2ImageGenerateAudio
					}
					seedanceDuration={imageState.seedance.duration}
					onSeedanceDurationChange={imageSetters.setSeedanceDuration}
					seedanceResolution={imageState.seedance.resolution}
					onSeedanceResolutionChange={imageSetters.setSeedanceResolution}
					seedanceAspectRatio={imageState.seedance.aspectRatio}
					onSeedanceAspectRatioChange={imageSetters.setSeedanceAspectRatio}
					seedanceCameraFixed={imageState.seedance.cameraFixed}
					onSeedanceCameraFixedChange={imageSetters.setSeedanceCameraFixed}
					seedanceEndFrameUrl={imageState.seedance.endFrameUrl}
					onSeedanceEndFrameUrlChange={imageSetters.setSeedanceEndFrameUrl}
					seedanceEndFrameFile={imageState.seedance.endFrameFile}
					seedanceEndFramePreview={imageState.seedance.endFramePreview}
					onSeedanceEndFrameFileChange={(file, preview) => {
						imageSetters.setSeedanceEndFrameFile(file);
						if (file) {
							imageSetters.setSeedanceEndFrameUrl(undefined);
						}
					}}
					klingDuration={imageState.kling.duration}
					onKlingDurationChange={imageSetters.setKlingDuration}
					klingCfgScale={imageState.kling.cfgScale}
					onKlingCfgScaleChange={imageSetters.setKlingCfgScale}
					klingAspectRatio={imageState.kling.aspectRatio}
					onKlingAspectRatioChange={imageSetters.setKlingAspectRatio}
					klingEnhancePrompt={imageState.kling.enhancePrompt}
					onKlingEnhancePromptChange={imageSetters.setKlingEnhancePrompt}
					klingNegativePrompt={imageState.kling.negativePrompt}
					onKlingNegativePromptChange={imageSetters.setKlingNegativePrompt}
					kling26Duration={imageState.kling26.duration}
					onKling26DurationChange={imageSetters.setKling26Duration}
					kling26CfgScale={imageState.kling26.cfgScale}
					onKling26CfgScaleChange={imageSetters.setKling26CfgScale}
					kling26AspectRatio={imageState.kling26.aspectRatio}
					onKling26AspectRatioChange={imageSetters.setKling26AspectRatio}
					kling26GenerateAudio={imageState.kling26.generateAudio}
					onKling26GenerateAudioChange={imageSetters.setKling26GenerateAudio}
					kling26NegativePrompt={imageState.kling26.negativePrompt}
					onKling26NegativePromptChange={imageSetters.setKling26NegativePrompt}
					wan25Duration={imageState.wan25.duration}
					onWan25DurationChange={imageSetters.setWan25Duration}
					wan25Resolution={imageState.wan25.resolution}
					onWan25ResolutionChange={imageSetters.setWan25Resolution}
					wan25EnablePromptExpansion={imageState.wan25.enablePromptExpansion}
					onWan25EnablePromptExpansionChange={
						imageSetters.setWan25EnablePromptExpansion
					}
					wan25NegativePrompt={imageState.wan25.negativePrompt}
					onWan25NegativePromptChange={imageSetters.setWan25NegativePrompt}
					wan25AudioUrl={imageState.wan25.audioUrl}
					onWan25AudioUrlChange={imageSetters.setWan25AudioUrl}
					wan25AudioFile={imageState.wan25.audioFile}
					wan25AudioPreview={imageState.wan25.audioPreview}
					onWan25AudioFileChange={(file, preview) => {
						imageSetters.setWan25AudioFile(file);
						if (file) {
							imageSetters.setWan25AudioUrl(undefined);
						}
					}}
					imageSeed={imageState.imageSeed}
					onImageSeedChange={imageSetters.setImageSeed}
					generation={{
						setFirstFrame: generation.setFirstFrame,
						setLastFrame: generation.setLastFrame,
					}}
				/>
			</TabsContent>

			{/* Avatar Tab */}
			<TabsContent value="avatar" className="space-y-4">
				<AIAvatarTab
					prompt={prompt}
					onPromptChange={setPrompt}
					maxChars={maxChars}
					selectedModels={selectedModels}
					isCompact={isCompact}
					onError={setError}
					avatarImage={avatarState.avatarImage}
					avatarImagePreview={avatarState.avatarImagePreview}
					onAvatarImageChange={(file, preview) => {
						avatarSetters.setAvatarImage(file);
						if (file) setError(null);
					}}
					avatarLastFrame={avatarState.avatarLastFrame}
					avatarLastFramePreview={avatarState.avatarLastFramePreview}
					onAvatarLastFrameChange={(file, preview) => {
						avatarSetters.setAvatarLastFrame(file);
						if (file) setError(null);
					}}
					referenceImages={avatarState.referenceImages}
					referenceImagePreviews={avatarState.referenceImagePreviews}
					onReferenceImageChange={(index, file, preview) => {
						avatarSetters.setReferenceImage(index, file);
						if (file) setError(null);
					}}
					audioFile={avatarState.audioFile}
					onAudioFileChange={(file) => {
						avatarSetters.setAudioFile(file);
						if (file) setError(null);
					}}
					sourceVideo={avatarState.sourceVideo}
					onSourceVideoChange={(file) => {
						avatarSetters.setSourceVideo(file);
						if (file) setError(null);
					}}
					klingAvatarV2Prompt={avatarState.klingAvatarV2Prompt}
					onKlingAvatarV2PromptChange={avatarSetters.setKlingAvatarV2Prompt}
					audioDuration={avatarState.audioDuration}
					syncLipsyncSourceVideo={avatarState.syncLipsyncSourceVideo}
					syncLipsyncSourceVideoPreview={
						avatarState.syncLipsyncSourceVideoPreview
					}
					syncLipsyncVideoDuration={avatarState.syncLipsyncVideoDuration}
					syncLipsyncEmotion={avatarState.syncLipsyncEmotion}
					syncLipsyncModelMode={avatarState.syncLipsyncModelMode}
					syncLipsyncLipsyncMode={avatarState.syncLipsyncLipsyncMode}
					syncLipsyncTemperature={avatarState.syncLipsyncTemperature}
					onSyncLipsyncSourceVideoChange={(file) => {
						avatarSetters.setSyncLipsyncSourceVideo(file);
						if (file) setError(null);
					}}
					onSyncLipsyncEmotionChange={avatarSetters.setSyncLipsyncEmotion}
					onSyncLipsyncModelModeChange={avatarSetters.setSyncLipsyncModelMode}
					onSyncLipsyncLipsyncModeChange={
						avatarSetters.setSyncLipsyncLipsyncMode
					}
					onSyncLipsyncTemperatureChange={
						avatarSetters.setSyncLipsyncTemperature
					}
					extendVideoAspectRatio={avatarState.extendVideoAspectRatio}
					onExtendVideoAspectRatioChange={
						avatarSetters.setExtendVideoAspectRatio
					}
					extendVideoGenerateAudio={avatarState.extendVideoGenerateAudio}
					onExtendVideoGenerateAudioChange={
						avatarSetters.setExtendVideoGenerateAudio
					}
				/>
			</TabsContent>

			{/* Upscale Tab */}
			<TabsContent value="upscale" className="space-y-4">
				<AIUpscaleTab
					selectedModels={selectedModels}
					isCompact={isCompact}
					onError={setError}
					sourceVideoFile={upscaleState.sourceVideoFile}
					sourceVideoUrl={upscaleState.sourceVideoUrl}
					videoMetadata={upscaleState.videoMetadata}
					onSourceVideoFileChange={upscaleHandlers.handleUpscaleVideoChange}
					onSourceVideoUrlChange={upscaleSetters.setSourceVideoUrl}
					onVideoUrlBlur={upscaleHandlers.handleUpscaleVideoUrlBlur}
					setVideoMetadata={(_metadata) => {
						// Video metadata is set via handlers
					}}
					bytedanceTargetResolution={upscaleState.bytedance.targetResolution}
					onBytedanceTargetResolutionChange={
						upscaleSetters.setBytedanceTargetResolution
					}
					bytedanceTargetFPS={upscaleState.bytedance.targetFPS}
					onBytedanceTargetFPSChange={upscaleSetters.setBytedanceTargetFPS}
					bytedanceEstimatedCost={bytedanceEstimatedCost}
					flashvsrUpscaleFactor={upscaleState.flashvsr.upscaleFactor}
					onFlashvsrUpscaleFactorChange={
						upscaleSetters.setFlashvsrUpscaleFactor
					}
					flashvsrAcceleration={upscaleState.flashvsr.acceleration}
					onFlashvsrAccelerationChange={upscaleSetters.setFlashvsrAcceleration}
					flashvsrQuality={upscaleState.flashvsr.quality}
					onFlashvsrQualityChange={upscaleSetters.setFlashvsrQuality}
					flashvsrColorFix={upscaleState.flashvsr.colorFix}
					onFlashvsrColorFixChange={upscaleSetters.setFlashvsrColorFix}
					flashvsrPreserveAudio={upscaleState.flashvsr.preserveAudio}
					onFlashvsrPreserveAudioChange={
						upscaleSetters.setFlashvsrPreserveAudio
					}
					flashvsrOutputFormat={upscaleState.flashvsr.outputFormat}
					onFlashvsrOutputFormatChange={upscaleSetters.setFlashvsrOutputFormat}
					flashvsrOutputQuality={upscaleState.flashvsr.outputQuality}
					onFlashvsrOutputQualityChange={
						upscaleSetters.setFlashvsrOutputQuality
					}
					flashvsrOutputWriteMode={upscaleState.flashvsr.outputWriteMode}
					onFlashvsrOutputWriteModeChange={
						upscaleSetters.setFlashvsrOutputWriteMode
					}
					flashvsrSeed={upscaleState.flashvsr.seed}
					onFlashvsrSeedChange={upscaleSetters.setFlashvsrSeed}
					flashvsrEstimatedCost={flashvsrEstimatedCost}
					topazUpscaleFactor={upscaleState.topaz.upscaleFactor}
					onTopazUpscaleFactorChange={upscaleSetters.setTopazUpscaleFactor}
					topazTargetFPS={upscaleState.topaz.targetFPS}
					onTopazTargetFPSChange={upscaleSetters.setTopazTargetFPS}
					topazH264Output={upscaleState.topaz.h264Output}
					onTopazH264OutputChange={upscaleSetters.setTopazH264Output}
				/>
			</TabsContent>

			{/* Angles Tab */}
			<TabsContent value="angles" className="space-y-4">
				<AIAnglesTab
					prompt={prompt}
					onPromptChange={setPrompt}
					isCompact={isCompact}
					onError={setError}
					anglesState={anglesTabState}
				/>
			</TabsContent>
		</>
	);
}
