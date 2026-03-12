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

import { useState, useCallback, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
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
	MicIcon,
	UploadIcon,
	CopyIcon,
	XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDragDrop } from "@/hooks/use-drag-drop";
import { useSoundsStore } from "@/stores/media/sounds-store";
import {
	CHATTERBOX_CONFIG,
	ELEVENLABS_CONFIG,
	QWEN3_TTS_CONFIG,
} from "@/components/editor/media-panel/views/ai/constants/ai-constants";
import {
	generateSpeech,
	convertSpeech,
	generateElevenLabsSpeech,
	generateQwen3Speech,
	cloneQwen3Voice,
} from "@/lib/ai-video/generators/speech";
import type { SoundEffect } from "@/types/sounds";

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

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
	const [isCloning, setIsCloning] = useState(false);

	// S2S params
	const [sourceAudioUrl, setSourceAudioUrl] = useState("");
	const [targetVoiceUrl, setTargetVoiceUrl] = useState("");

	// Generation state
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [generatedAudio, setGeneratedAudio] = useState<GeneratedAudio | null>(
		null
	);
	const [playingAudio, setPlayingAudio] = useState<HTMLAudioElement | null>(
		null
	);
	const [isPlaying, setIsPlaying] = useState(false);

	const { addSoundToTimeline } = useSoundsStore();

	const insertTag = useCallback((tag: string) => {
		setText((prev) => `${prev}<${tag}>`);
	}, []);

	const processCloneFile = useCallback((file: File) => {
		if (!isAudioFile(file)) {
			setError("Please upload an audio file (MP3, WAV, AAC, M4A).");
			return;
		}
		if (file.size > 10 * 1024 * 1024) {
			setError("File too large. Maximum size is 10 MB.");
			return;
		}
		setCloneFile(file);
		setError(null);
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
			setError("Please upload a reference audio file.");
			return;
		}
		setError(null);
		setIsCloning(true);
		try {
			const result = await cloneQwen3Voice({
				endpoint: QWEN3_TTS_CONFIG.TTS.CLONE_ENDPOINT,
				audioUrl: cloneAudioUrl,
				referenceText: cloneRefText || undefined,
			});
			setClonedEmbeddingUrl(result.embeddingUrl);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Voice cloning failed."
			);
		} finally {
			setIsCloning(false);
		}
	}, [cloneAudioUrl, cloneRefText]);

	const handleGenerate = useCallback(async () => {
		setError(null);
		setIsGenerating(true);

		try {
			if (mode === "tts") {
				if (!text.trim()) {
					setError("Please enter text to generate speech.");
					return;
				}

				let audioUrl: string;
				let jobId: string;
				let audioDuration: number | undefined;

				if (
					provider === "chatterbox" ||
					provider === "chatterbox_turbo"
				) {
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
						language:
							qwLanguage !== "Auto" ? qwLanguage : undefined,
						prompt: stylePrompt || undefined,
						speakerEmbeddingUrl: clonedEmbeddingUrl || undefined,
						referenceText:
							clonedEmbeddingUrl && cloneRefText
								? cloneRefText
								: undefined,
						temperature: qwTemperature,
					});
					audioUrl = result.audioUrl;
					jobId = result.jobId;
					audioDuration = result.duration;
				}

				const name =
					text.trim().slice(0, 40) +
					(text.length > 40 ? "..." : "");
				setGeneratedAudio({
					id: jobId,
					name,
					url: audioUrl,
					duration: audioDuration ?? 0,
				});
			} else if (mode === "s2s") {
				if (!sourceAudioUrl.trim()) {
					setError("Please provide a source audio URL.");
					return;
				}
				const result = await convertSpeech({
					endpoint: CHATTERBOX_CONFIG.S2S.ENDPOINT,
					sourceAudioUrl: sourceAudioUrl.trim(),
					targetVoiceAudioUrl: targetVoiceUrl || undefined,
				});
				setGeneratedAudio({
					id: result.jobId,
					name: "Voice conversion",
					url: result.audioUrl,
					duration: 0,
				});
			}
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Speech generation failed."
			);
		} finally {
			setIsGenerating(false);
		}
	}, [
		mode,
		text,
		provider,
		voiceRefUrl,
		exaggeration,
		cbTemperature,
		cfg,
		elVoice,
		stability,
		languageCode,
		qwVoice,
		qwLanguage,
		stylePrompt,
		qwTemperature,
		clonedEmbeddingUrl,
		cloneRefText,
		sourceAudioUrl,
		targetVoiceUrl,
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

		await addSoundToTimeline(soundEffect);
	}, [generatedAudio, addSoundToTimeline, provider, mode]);

	return (
		<ScrollArea className="flex-1 h-full">
			<div className="flex flex-col gap-4 mt-1 pr-1">
				{/* Mode toggle */}
				<div className="flex gap-2">
					<Button
						variant={mode === "tts" ? "default" : "outline"}
						size="sm"
						onClick={() => setMode("tts")}
					>
						<MicIcon className="w-3.5 h-3.5 mr-1.5" />
						Text to Speech
					</Button>
					<Button
						variant={mode === "s2s" ? "default" : "outline"}
						size="sm"
						onClick={() => setMode("s2s")}
					>
						<UploadIcon className="w-3.5 h-3.5 mr-1.5" />
						Voice Convert
					</Button>
					<Button
						variant={mode === "clone" ? "default" : "outline"}
						size="sm"
						onClick={() => setMode("clone")}
					>
						<CopyIcon className="w-3.5 h-3.5 mr-1.5" />
						Voice Clone
					</Button>
				</div>

				{/* TTS mode */}
				{mode === "tts" && (
					<>
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">Text</Label>
							<Textarea
								placeholder="Enter text to speak..."
								value={text}
								onChange={(e) => setText(e.target.value)}
								className="min-h-[80px] bg-panel-accent"
								maxLength={
									CHATTERBOX_CONFIG.TTS.MAX_TEXT_LENGTH
								}
							/>
							<span className="text-xs text-muted-foreground text-right">
								{text.length}/
								{CHATTERBOX_CONFIG.TTS.MAX_TEXT_LENGTH}
							</span>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">Model</Label>
							<Select
								value={provider}
								onValueChange={(v) =>
									setProvider(v as TTSProvider)
								}
							>
								<SelectTrigger className="h-8 bg-panel-accent">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="chatterbox">
										Chatterbox
									</SelectItem>
									<SelectItem value="chatterbox_turbo">
										Chatterbox Turbo
									</SelectItem>
									<SelectItem value="elevenlabs_v3">
										ElevenLabs v3
									</SelectItem>
									<SelectItem value="qwen3_tts">
										Qwen3 TTS
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{(provider === "chatterbox" ||
							provider === "chatterbox_turbo") && (
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
							<Label className="text-xs">Source audio URL</Label>
							<input
								type="text"
								placeholder="https://example.com/source.wav"
								value={sourceAudioUrl}
								onChange={(e) =>
									setSourceAudioUrl(e.target.value)
								}
								className="h-8 rounded-md border bg-panel-accent px-3 text-sm"
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">
								Target voice URL (optional)
							</Label>
							<input
								type="text"
								placeholder="https://example.com/target-voice.wav"
								value={targetVoiceUrl}
								onChange={(e) =>
									setTargetVoiceUrl(e.target.value)
								}
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
						onClick={handleCloneVoice}
						disabled={isCloning || !cloneAudioUrl}
						className="w-full"
					>
						{isCloning ? (
							<>
								<Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
								Cloning...
							</>
						) : clonedEmbeddingUrl ? (
							"Re-clone Voice"
						) : (
							"Clone Voice"
						)}
					</Button>
				) : (
					<Button
						onClick={handleGenerate}
						disabled={isGenerating}
						className="w-full"
					>
						{isGenerating ? (
							<>
								<Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
								Generating...
							</>
						) : (
							"Generate"
						)}
					</Button>
				)}

				{/* Error */}
				{error && (
					<p className="text-sm text-destructive">{error}</p>
				)}

				{/* Clone success message */}
				{mode === "clone" && clonedEmbeddingUrl && (
					<div className="p-3 rounded-md bg-accent">
						<p className="text-sm font-medium">
							Voice cloned successfully
						</p>
						<p className="text-xs text-muted-foreground mt-1">
							Switch to Text to Speech and select Qwen3 TTS to
							use this cloned voice for generation.
						</p>
					</div>
				)}

				{/* Generated result (TTS/S2S only) */}
				{mode !== "clone" && generatedAudio && (
					<div className="flex items-center gap-3 p-3 rounded-md bg-accent">
						<Button
							variant="text"
							size="icon"
							className="shrink-0 w-10 h-10"
							onClick={handlePlay}
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
							<p className="text-xs text-muted-foreground">
								AI Generated
							</p>
						</div>
						<Button
							size="sm"
							variant="outline"
							onClick={handleAddToTimeline}
						>
							+ Timeline
						</Button>
					</div>
				)}
			</div>
		</ScrollArea>
	);
}

// ── Provider-specific control components ─────────────────────────────

interface ChatterboxControlsProps {
	exaggeration: number;
	setExaggeration: (v: number) => void;
	temperature: number;
	setTemperature: (v: number) => void;
	cfg: number;
	setCfg: (v: number) => void;
	voiceRefUrl: string;
	setVoiceRefUrl: (v: string) => void;
	insertTag: (tag: string) => void;
}

function ChatterboxControls({
	exaggeration,
	setExaggeration,
	temperature,
	setTemperature,
	cfg,
	setCfg,
	voiceRefUrl,
	setVoiceRefUrl,
	insertTag,
}: ChatterboxControlsProps) {
	return (
		<>
			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">Emotive tags</Label>
				<div className="flex flex-wrap gap-1">
					{CHATTERBOX_CONFIG.TTS.EMOTIVE_TAGS.map((tag) => (
						<Button
							key={tag}
							variant="outline"
							size="sm"
							className="text-xs h-6 px-2"
							onClick={() => insertTag(tag)}
						>
							{tag}
						</Button>
					))}
				</div>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">
					Voice reference URL (optional)
				</Label>
				<input
					type="text"
					placeholder="https://example.com/voice.mp3"
					value={voiceRefUrl}
					onChange={(e) => setVoiceRefUrl(e.target.value)}
					className="h-8 rounded-md border bg-panel-accent px-3 text-sm"
				/>
			</div>
			<div className="flex flex-col gap-3">
				<SliderControl
					label="Exaggeration"
					value={exaggeration}
					onChange={setExaggeration}
					min={0}
					max={1}
					step={0.05}
				/>
				<SliderControl
					label="Temperature"
					value={temperature}
					onChange={setTemperature}
					min={0.05}
					max={2.0}
					step={0.05}
				/>
				<SliderControl
					label="CFG"
					value={cfg}
					onChange={setCfg}
					min={0.1}
					max={1.0}
					step={0.05}
				/>
			</div>
		</>
	);
}

interface ElevenLabsControlsProps {
	voice: string;
	setVoice: (v: string) => void;
	stability: number;
	setStability: (v: number) => void;
	languageCode: string;
	setLanguageCode: (v: string) => void;
}

function ElevenLabsControls({
	voice,
	setVoice,
	stability,
	setStability,
	languageCode,
	setLanguageCode,
}: ElevenLabsControlsProps) {
	return (
		<>
			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">Voice</Label>
				<Select value={voice} onValueChange={setVoice}>
					<SelectTrigger className="h-8 bg-panel-accent">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{ELEVENLABS_CONFIG.TTS.VOICES.map((v) => (
							<SelectItem key={v} value={v}>
								{v}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<SliderControl
				label="Stability"
				value={stability}
				onChange={setStability}
				min={0}
				max={1}
				step={0.05}
			/>
			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">
					Language code (optional, e.g. "en", "es")
				</Label>
				<input
					type="text"
					placeholder="en"
					value={languageCode}
					onChange={(e) => setLanguageCode(e.target.value)}
					className="h-8 rounded-md border bg-panel-accent px-3 text-sm"
					maxLength={5}
				/>
			</div>
		</>
	);
}

interface Qwen3ControlsProps {
	voice: string;
	setVoice: (v: string) => void;
	language: string;
	setLanguage: (v: string) => void;
	stylePrompt: string;
	setStylePrompt: (v: string) => void;
	temperature: number;
	setTemperature: (v: number) => void;
	clonedEmbeddingUrl: string;
}

function Qwen3Controls({
	voice,
	setVoice,
	language,
	setLanguage,
	stylePrompt,
	setStylePrompt,
	temperature,
	setTemperature,
	clonedEmbeddingUrl,
}: Qwen3ControlsProps) {
	return (
		<>
			{clonedEmbeddingUrl ? (
				<div className="p-2 rounded-md bg-accent">
					<p className="text-xs text-muted-foreground">
						Using cloned voice. To change, go to the Voice Clone
						tab.
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-1.5">
					<Label className="text-xs">Voice</Label>
					<Select value={voice} onValueChange={setVoice}>
						<SelectTrigger className="h-8 bg-panel-accent">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{QWEN3_TTS_CONFIG.TTS.VOICES.map((v) => (
								<SelectItem key={v} value={v}>
									{v}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}

			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">Language</Label>
				<Select value={language} onValueChange={setLanguage}>
					<SelectTrigger className="h-8 bg-panel-accent">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{QWEN3_TTS_CONFIG.TTS.LANGUAGES.map((l) => (
							<SelectItem key={l} value={l}>
								{l}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">Style prompt (optional)</Label>
				<input
					type="text"
					placeholder="Read this in a cheerful tone"
					value={stylePrompt}
					onChange={(e) => setStylePrompt(e.target.value)}
					className="h-8 rounded-md border bg-panel-accent px-3 text-sm"
				/>
			</div>

			<SliderControl
				label="Temperature"
				value={temperature}
				onChange={setTemperature}
				min={0}
				max={1}
				step={0.05}
			/>
		</>
	);
}

// ── Voice Clone controls ─────────────────────────────────────────────

interface VoiceCloneControlsProps {
	cloneFile: File | null;
	onFileSelect: (file: File) => void;
	onClearFile: () => void;
	cloneRefText: string;
	setCloneRefText: (v: string) => void;
	clonedEmbeddingUrl: string;
}

function VoiceCloneControls({
	cloneFile,
	onFileSelect,
	onClearFile,
	cloneRefText,
	setCloneRefText,
	clonedEmbeddingUrl,
}: VoiceCloneControlsProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);

	const { isDragOver, dragProps } = useDragDrop({
		onDrop: (files) => {
			if (files.length > 0) {
				onFileSelect(files[0]);
			}
		},
	});

	return (
		<>
			<p className="text-xs text-muted-foreground">
				Upload a voice sample to clone. The cloned voice can be used
				with Qwen3 TTS in the Text to Speech tab.
			</p>

			{/* Hidden file input */}
			<input
				ref={fileInputRef}
				type="file"
				accept="audio/*"
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) onFileSelect(file);
					e.target.value = "";
				}}
			/>

			{/* File drop zone or file preview */}
			{cloneFile ? (
				<div className="flex items-center gap-3 p-3 rounded-lg border bg-panel-accent">
					<div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10">
						<MicIcon className="w-5 h-5 text-primary" />
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-sm font-medium truncate">
							{cloneFile.name}
						</p>
						<p className="text-xs text-muted-foreground">
							{formatFileSize(cloneFile.size)}
						</p>
					</div>
					<Button
						variant="text"
						size="icon"
						className="shrink-0"
						onClick={onClearFile}
					>
						<XIcon className="w-4 h-4" />
					</Button>
				</div>
			) : (
				<div
					className={cn(
						"relative border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer",
						isDragOver
							? "border-primary bg-primary/5"
							: "border-muted-foreground/25 hover:border-muted-foreground/50"
					)}
					onClick={() => fileInputRef.current?.click()}
					{...dragProps}
				>
					<div className="text-center space-y-2">
						<div className="mx-auto size-10 rounded-full bg-muted flex items-center justify-center">
							<UploadIcon className="size-5 text-muted-foreground" />
						</div>
						<div>
							<p className="text-sm font-medium">
								Drop audio file here
							</p>
							<p className="text-xs text-muted-foreground">
								or click to browse — MP3, WAV, AAC up to 10 MB
							</p>
						</div>
					</div>
				</div>
			)}

			{/* Reference text */}
			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">
					Reference text (optional — what was said in the audio)
				</Label>
				<input
					type="text"
					placeholder="What was said in the audio"
					value={cloneRefText}
					onChange={(e) => setCloneRefText(e.target.value)}
					className="h-8 rounded-md border bg-panel-accent px-3 text-sm"
				/>
			</div>

			{clonedEmbeddingUrl && (
				<div className="p-2 rounded-md bg-accent">
					<p className="text-xs text-muted-foreground">
						Current cloned voice embedding: ready to use
					</p>
				</div>
			)}
		</>
	);
}

// ── Shared slider control ────────────────────────────────────────────

interface SliderControlProps {
	label: string;
	value: number;
	onChange: (v: number) => void;
	min: number;
	max: number;
	step: number;
}

function SliderControl({
	label,
	value,
	onChange,
	min,
	max,
	step,
}: SliderControlProps) {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center justify-between">
				<Label className="text-xs">{label}</Label>
				<span className="text-xs text-muted-foreground">
					{value.toFixed(2)}
				</span>
			</div>
			<Slider
				value={[value]}
				onValueChange={([v]) => onChange(v)}
				min={min}
				max={max}
				step={step}
			/>
		</div>
	);
}
