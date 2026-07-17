/**
 * AI Voice Tab for Sounds Panel
 *
 * Three modes:
 * - Text to Speech: Generate speech from text (Chatterbox, ElevenLabs, Qwen3)
 * - Voice Convert: Convert speech to a different voice (Chatterbox S2S)
 * - Voice Clone: Clone a voice from reference audio (Qwen3), then use it in TTS
 *
 * Reuses AudioItem and addSoundToTimeline from the existing sounds infrastructure.
 */

import { useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	PlayIcon,
	PauseIcon,
	Loader2Icon,
	CopyIcon,
	MicIcon,
	UploadIcon,
} from "lucide-react";
import { useSoundsStore } from "@/stores/media/sounds-store";
import { usePersistentAiTask } from "@/hooks/use-persistent-ai-task";
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import {
	generateSpeech,
	convertSpeech,
	generateElevenLabsSpeech,
	generateQwen3Speech,
	cloneQwen3Voice,
} from "@/lib/ai-video/generators/speech";
import type { SoundEffect } from "@/types/sounds";
import {
	ChatterboxControls,
	ElevenLabsControls,
	Qwen3Controls,
	VoiceCloneControls,
} from "./sounds-ai-voice-controls";
import {
	CHATTERBOX_CONFIG,
	ELEVENLABS_CONFIG,
	QWEN3_TTS_CONFIG,
} from "@/components/editor/media-panel/views/ai/constants/ai-constants";

type VoiceMode = "tts" | "s2s" | "clone";
type TTSProvider =
	| "chatterbox"
	| "chatterbox_turbo"
	| "elevenlabs_v3"
	| "qwen3_tts";

interface GeneratedAudio {
	id: string;
	name: string;
	url: string;
	duration: number;
}

const PROVIDER_LABELS: Record<TTSProvider, string> = {
	chatterbox: "Chatterbox",
	chatterbox_turbo: "Chatterbox Turbo",
	elevenlabs_v3: "ElevenLabs v3",
	qwen3_tts: "Qwen3 TTS",
};

const ALLOWED_AUDIO_TYPES = [
	"audio/mpeg",
	"audio/wav",
	"audio/aac",
	"audio/mp4",
	"audio/ogg",
	"audio/webm",
];

function isAudioFile(file: File): boolean {
	return (
		ALLOWED_AUDIO_TYPES.includes(file.type) ||
		/\.(mp3|wav|aac|m4a|ogg|webm)$/i.test(file.name)
	);
}

export function AIVoiceView() {
	const [mode, setMode] = useState<VoiceMode>("tts");
	const [text, setText] = useState("");
	const [provider, setProvider] = useState<TTSProvider>("chatterbox");

	// Chatterbox params
	const [exaggeration, setExaggeration] = useState<number>(
		CHATTERBOX_CONFIG.TTS.DEFAULT_EXAGGERATION
	);
	const [cbTemperature, setCbTemperature] = useState<number>(
		CHATTERBOX_CONFIG.TTS.DEFAULT_TEMPERATURE
	);
	const [cfg, setCfg] = useState<number>(CHATTERBOX_CONFIG.TTS.DEFAULT_CFG);
	const [voiceRefUrl, setVoiceRefUrl] = useState("");

	// ElevenLabs params
	const [elVoice, setElVoice] = useState<string>(
		ELEVENLABS_CONFIG.TTS.DEFAULT_VOICE
	);
	const [stability, setStability] = useState<number>(
		ELEVENLABS_CONFIG.TTS.DEFAULT_STABILITY
	);
	const [languageCode, setLanguageCode] = useState("");

	// Qwen3 params
	const [qwVoice, setQwVoice] = useState<string>(
		QWEN3_TTS_CONFIG.TTS.VOICES[0]
	);
	const [qwLanguage, setQwLanguage] = useState("Auto");
	const [stylePrompt, setStylePrompt] = useState("");
	const [qwTemperature, setQwTemperature] = useState<number>(
		QWEN3_TTS_CONFIG.TTS.DEFAULT_TEMPERATURE
	);

	// Voice clone params (shared across clone tab and Qwen3 TTS)
	const [cloneFile, setCloneFile] = useState<File | null>(null);
	const [cloneAudioUrl, setCloneAudioUrl] = useState("");
	const [cloneRefText, setCloneRefText] = useState("");
	const [clonedEmbeddingUrl, setClonedEmbeddingUrl] = useState("");
	// S2S params
	const [sourceAudioUrl, setSourceAudioUrl] = useState("");
	const [targetVoiceUrl, setTargetVoiceUrl] = useState("");

	// Generation state
	const [validationError, setValidationError] = useState<string | null>(null);
	const [generatedAudio, setGeneratedAudio] = useState<GeneratedAudio | null>(
		null
	);
	const [playingAudio, setPlayingAudio] = useState<HTMLAudioElement | null>(
		null
	);
	const [isPlaying, setIsPlaying] = useState(false);

	const { addSoundToTimeline } = useSoundsStore();
	const {
		runTask: runCloneTask,
		isRunning: isCloning,
		error: cloneError,
		clearError: clearCloneError,
	} = usePersistentAiTask();
	const {
		runTask: runGenerationTask,
		isRunning: isGenerating,
		error: generationError,
		clearError: clearGenerationError,
	} = usePersistentAiTask();
	const error = validationError ?? cloneError ?? generationError;
	const openAiVoice = useCallback(() => {
		const mediaPanel = useMediaPanelStore.getState();
		mediaPanel.setActiveTab("sounds");
		mediaPanel.setActiveSoundsTab("ai-voice");
	}, []);

	const insertTag = useCallback((tag: string) => {
		setText((prev) => `${prev}<${tag}>`);
	}, []);

	const processCloneFile = useCallback((file: File) => {
		if (!isAudioFile(file)) {
			setValidationError("请上传 MP3、WAV、AAC 或 M4A 音频文件。");
			return;
		}
		if (file.size > 10 * 1024 * 1024) {
			setValidationError("文件过大，最大支持 10 MB。");
			return;
		}
		setCloneFile(file);
		setValidationError(null);
		const reader = new FileReader();
		reader.onload = () => {
			if (reader.result) {
				setCloneAudioUrl(reader.result as string);
			}
		};
		reader.readAsDataURL(file);
	}, []);

	const clearCloneFile = useCallback(() => {
		setCloneFile(null);
		setCloneAudioUrl("");
		setClonedEmbeddingUrl("");
	}, []);

	const handleCloneVoice = useCallback(async () => {
		if (!cloneAudioUrl) {
			setValidationError("请先上传参考音频。");
			return;
		}
		setValidationError(null);
		clearCloneError();
		clearGenerationError();
		await runCloneTask({
			label: "克隆音色",
			payload: {
				referenceName: cloneFile?.name ?? "reference-audio",
				hasReferenceText: Boolean(cloneRefText.trim()),
			},
			startMessage: "正在克隆参考音色",
			completeMessage: "音色克隆完成",
			open: openAiVoice,
			execute: async ({ updateProgress }) => {
				updateProgress({ progress: 25, message: "正在上传参考音频" });
				const result = await cloneQwen3Voice({
					endpoint: QWEN3_TTS_CONFIG.TTS.CLONE_ENDPOINT,
					audioUrl: cloneAudioUrl,
					referenceText: cloneRefText || undefined,
				});
				updateProgress({ progress: 90, message: "正在保存克隆音色" });
				return result;
			},
			onSuccess: (result) => setClonedEmbeddingUrl(result.embeddingUrl),
			onUndo: (result) =>
				setClonedEmbeddingUrl((current) =>
					current === result.embeddingUrl ? "" : current
				),
			output: (result) => ({ embeddingUrl: result.embeddingUrl }),
		});
	}, [
		clearCloneError,
		clearGenerationError,
		cloneAudioUrl,
		cloneFile?.name,
		cloneRefText,
		openAiVoice,
		runCloneTask,
	]);

	const handleGenerate = useCallback(async () => {
		if (mode === "tts" && !text.trim()) {
			setValidationError("请输入要生成的配音文本。");
			return;
		}
		if (mode === "s2s" && !sourceAudioUrl.trim()) {
			setValidationError("请提供源音频 URL。");
			return;
		}
		setValidationError(null);
		clearCloneError();
		clearGenerationError();
		await runGenerationTask({
			label: mode === "tts" ? "生成 AI 配音" : "转换音色",
			payload: {
				mode,
				provider: mode === "tts" ? provider : "chatterbox",
				textLength: mode === "tts" ? text.trim().length : 0,
			},
			startMessage: mode === "tts" ? "正在生成 AI 配音" : "正在转换音色",
			completeMessage: mode === "tts" ? "AI 配音生成完成" : "音色转换完成",
			open: openAiVoice,
			execute: async ({ updateProgress }) => {
				updateProgress({ progress: 20, message: "正在提交生成任务" });
				if (mode === "tts") {
					let audioUrl: string;
					let jobId: string;
					let audioDuration: number | undefined;

					if (provider === "chatterbox" || provider === "chatterbox_turbo") {
						const endpoint =
							provider === "chatterbox_turbo"
								? CHATTERBOX_CONFIG.TTS.TURBO_ENDPOINT
								: CHATTERBOX_CONFIG.TTS.ENDPOINT;
						const result = await generateSpeech({
							text: text.trim(),
							endpoint,
							audioUrl: voiceRefUrl || undefined,
							exaggeration,
							temperature: cbTemperature,
							cfg,
						});
						audioUrl = result.audioUrl;
						jobId = result.jobId;
					} else if (provider === "elevenlabs_v3") {
						const result = await generateElevenLabsSpeech({
							text: text.trim(),
							endpoint: ELEVENLABS_CONFIG.TTS.ENDPOINT,
							voice: elVoice,
							stability,
							languageCode: languageCode || undefined,
						});
						audioUrl = result.audioUrl;
						jobId = result.jobId;
					} else {
						const result = await generateQwen3Speech({
							text: text.trim(),
							endpoint: QWEN3_TTS_CONFIG.TTS.ENDPOINT,
							voice: clonedEmbeddingUrl ? undefined : qwVoice,
							language: qwLanguage !== "Auto" ? qwLanguage : undefined,
							prompt: stylePrompt || undefined,
							speakerEmbeddingUrl: clonedEmbeddingUrl || undefined,
							referenceText:
								clonedEmbeddingUrl && cloneRefText ? cloneRefText : undefined,
							temperature: qwTemperature,
						});
						audioUrl = result.audioUrl;
						jobId = result.jobId;
						audioDuration = result.duration;
					}

					const trimmedText = text.trim();
					const name =
						trimmedText.slice(0, 40) + (trimmedText.length > 40 ? "..." : "");
					updateProgress({ progress: 90, message: "正在准备配音结果" });
					return {
						id: jobId,
						name,
						url: audioUrl,
						duration: audioDuration ?? 0,
					};
				}
				const result = await convertSpeech({
					endpoint: CHATTERBOX_CONFIG.S2S.ENDPOINT,
					sourceAudioUrl: sourceAudioUrl.trim(),
					targetVoiceAudioUrl: targetVoiceUrl || undefined,
				});
				updateProgress({ progress: 90, message: "正在准备转换结果" });
				return {
					id: result.jobId,
					name: "音色转换",
					url: result.audioUrl,
					duration: 0,
				};
			},
			onSuccess: setGeneratedAudio,
			onUndo: (result) =>
				setGeneratedAudio((current) =>
					current?.id === result.id ? null : current
				),
			output: (result) => ({
				jobId: result.id,
				audioUrl: result.url,
				duration: result.duration,
			}),
		});
	}, [
		cbTemperature,
		cfg,
		clearCloneError,
		clearGenerationError,
		cloneRefText,
		clonedEmbeddingUrl,
		elVoice,
		exaggeration,
		languageCode,
		mode,
		openAiVoice,
		provider,
		qwVoice,
		qwLanguage,
		qwTemperature,
		runGenerationTask,
		sourceAudioUrl,
		stability,
		stylePrompt,
		targetVoiceUrl,
		text,
		voiceRefUrl,
	]);

	const handlePlay = useCallback(() => {
		if (!generatedAudio) return;

		if (isPlaying && playingAudio) {
			playingAudio.pause();
			setIsPlaying(false);
			return;
		}

		playingAudio?.pause();
		const audio = new Audio(generatedAudio.url);
		audio.addEventListener("ended", () => setIsPlaying(false));
		audio.addEventListener("error", () => setIsPlaying(false));
		audio.play().catch(() => setIsPlaying(false));
		setPlayingAudio(audio);
		setIsPlaying(true);
	}, [generatedAudio, isPlaying, playingAudio]);

	const handleAddToTimeline = useCallback(async () => {
		if (!generatedAudio) return;

		const providerName =
			mode === "s2s" ? "Chatterbox" : PROVIDER_LABELS[provider];

		const soundEffect: SoundEffect = {
			id: Date.now(),
			name: generatedAudio.name,
			description: "AI-generated speech",
			url: generatedAudio.url,
			previewUrl: generatedAudio.url,
			downloadUrl: generatedAudio.url,
			duration: generatedAudio.duration,
			filesize: 0,
			type: "audio",
			channels: 1,
			bitrate: 0,
			bitdepth: 0,
			samplerate: 44100,
			username: providerName,
			tags: ["ai", "speech", "tts"],
			license: "generated",
			created: new Date().toISOString(),
			downloads: 0,
			rating: 0,
			ratingCount: 0,
		};

		await addSoundToTimeline({ sound: soundEffect });
	}, [generatedAudio, addSoundToTimeline, provider, mode]);

	return (
		<ScrollArea className="flex-1 h-full">
			<div className="flex flex-col gap-4 mt-1 pr-1">
				{/* Mode toggle */}
				<div className="flex gap-2">
					<Button
						type="button"
						variant={mode === "tts" ? "default" : "outline"}
						size="sm"
						onClick={() => setMode("tts")}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.currentTarget.click();
							}
						}}
					>
						<MicIcon className="w-3.5 h-3.5 mr-1.5" />
						文本转语音
					</Button>
					<Button
						type="button"
						variant={mode === "s2s" ? "default" : "outline"}
						size="sm"
						onClick={() => setMode("s2s")}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.currentTarget.click();
							}
						}}
					>
						<UploadIcon className="w-3.5 h-3.5 mr-1.5" />
						音色转换
					</Button>
					<Button
						type="button"
						variant={mode === "clone" ? "default" : "outline"}
						size="sm"
						onClick={() => setMode("clone")}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.currentTarget.click();
							}
						}}
					>
						<CopyIcon className="w-3.5 h-3.5 mr-1.5" />
						音色克隆
					</Button>
				</div>

				{/* TTS mode */}
				{mode === "tts" && (
					<>
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">文本</Label>
							<Textarea
								placeholder="输入要生成的配音文本..."
								value={text}
								onChange={(e) => setText(e.target.value)}
								className="min-h-[80px] bg-panel-accent"
								maxLength={CHATTERBOX_CONFIG.TTS.MAX_TEXT_LENGTH}
							/>
							<span className="text-xs text-muted-foreground text-right">
								{text.length}/{CHATTERBOX_CONFIG.TTS.MAX_TEXT_LENGTH}
							</span>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">模型</Label>
							<Select
								value={provider}
								onValueChange={(v) => setProvider(v as TTSProvider)}
							>
								<SelectTrigger className="h-8 bg-panel-accent">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="chatterbox">Chatterbox</SelectItem>
									<SelectItem value="chatterbox_turbo">
										Chatterbox Turbo
									</SelectItem>
									<SelectItem value="elevenlabs_v3">ElevenLabs v3</SelectItem>
									<SelectItem value="qwen3_tts">Qwen3 TTS</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{(provider === "chatterbox" || provider === "chatterbox_turbo") && (
							<ChatterboxControls
								exaggeration={exaggeration}
								setExaggeration={setExaggeration}
								temperature={cbTemperature}
								setTemperature={setCbTemperature}
								cfg={cfg}
								setCfg={setCfg}
								voiceRefUrl={voiceRefUrl}
								setVoiceRefUrl={setVoiceRefUrl}
								insertTag={insertTag}
							/>
						)}

						{provider === "elevenlabs_v3" && (
							<ElevenLabsControls
								voice={elVoice}
								setVoice={setElVoice}
								stability={stability}
								setStability={setStability}
								languageCode={languageCode}
								setLanguageCode={setLanguageCode}
							/>
						)}

						{provider === "qwen3_tts" && (
							<Qwen3Controls
								voice={qwVoice}
								setVoice={setQwVoice}
								language={qwLanguage}
								setLanguage={setQwLanguage}
								stylePrompt={stylePrompt}
								setStylePrompt={setStylePrompt}
								temperature={qwTemperature}
								setTemperature={setQwTemperature}
								clonedEmbeddingUrl={clonedEmbeddingUrl}
							/>
						)}
					</>
				)}

				{/* S2S mode */}
				{mode === "s2s" && (
					<>
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">源音频 URL</Label>
							<input
								type="text"
								placeholder="https://example.com/source.wav"
								value={sourceAudioUrl}
								onChange={(e) => setSourceAudioUrl(e.target.value)}
								className="h-8 rounded-md border bg-panel-accent px-3 text-sm"
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">目标音色 URL（可选）</Label>
							<input
								type="text"
								placeholder="https://example.com/target-voice.wav"
								value={targetVoiceUrl}
								onChange={(e) => setTargetVoiceUrl(e.target.value)}
								className="h-8 rounded-md border bg-panel-accent px-3 text-sm"
							/>
						</div>
					</>
				)}

				{/* Voice Clone mode */}
				{mode === "clone" && (
					<VoiceCloneControls
						cloneFile={cloneFile}
						onFileSelect={processCloneFile}
						onClearFile={clearCloneFile}
						cloneRefText={cloneRefText}
						setCloneRefText={setCloneRefText}
						clonedEmbeddingUrl={clonedEmbeddingUrl}
					/>
				)}

				{/* Action button */}
				{mode === "clone" ? (
					<Button
						type="button"
						onClick={handleCloneVoice}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.currentTarget.click();
							}
						}}
						disabled={isCloning || !cloneAudioUrl}
						className="w-full"
					>
						{isCloning ? (
							<>
								<Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
								正在克隆...
							</>
						) : clonedEmbeddingUrl ? (
							"重新克隆音色"
						) : (
							"克隆音色"
						)}
					</Button>
				) : (
					<Button
						type="button"
						onClick={handleGenerate}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.currentTarget.click();
							}
						}}
						disabled={isGenerating}
						className="w-full"
					>
						{isGenerating ? (
							<>
								<Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
								正在生成...
							</>
						) : (
							"生成"
						)}
					</Button>
				)}

				{/* Error */}
				{error && <p className="text-sm text-destructive">{error}</p>}

				{/* Clone success message */}
				{mode === "clone" && clonedEmbeddingUrl && (
					<div className="p-3 rounded-md bg-accent">
						<p className="text-sm font-medium">音色克隆成功</p>
						<p className="text-xs text-muted-foreground mt-1">
							切换到“文本转语音”并选择 Qwen3 TTS，即可使用该克隆音色。
						</p>
					</div>
				)}

				{/* Generated result (TTS/S2S only) */}
				{mode !== "clone" && generatedAudio && (
					<div className="flex items-center gap-3 p-3 rounded-md bg-accent">
						<Button
							type="button"
							variant="text"
							size="icon"
							className="shrink-0 w-10 h-10"
							onClick={handlePlay}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.currentTarget.click();
								}
							}}
							aria-label={isPlaying ? "暂停预览" : "播放预览"}
							title={isPlaying ? "暂停预览" : "播放预览"}
						>
							{isPlaying ? (
								<PauseIcon className="w-5 h-5" />
							) : (
								<PlayIcon className="w-5 h-5" />
							)}
						</Button>
						<div className="flex-1 min-w-0">
							<p className="text-sm font-medium truncate">
								{generatedAudio.name}
							</p>
							<p className="text-xs text-muted-foreground">AI 生成</p>
						</div>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={handleAddToTimeline}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.currentTarget.click();
								}
							}}
						>
							添加到时间线
						</Button>
					</div>
				)}
			</div>
		</ScrollArea>
	);
}
