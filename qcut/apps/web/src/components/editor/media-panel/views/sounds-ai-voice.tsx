/**
 * AI Voice Tab for Sounds Panel
 *
 * Text-to-speech and speech-to-speech generation using multiple providers via FAL.ai:
 * - Chatterbox: TTS with emotive tags, voice cloning, S2S voice conversion
 * - ElevenLabs v3: Premium multilingual TTS with named voices
 * - Qwen3: Multilingual TTS with style prompts and voice cloning
 *
 * Reuses AudioItem and addSoundToTimeline from the existing sounds infrastructure.
 */

import { useState, useCallback } from "react";
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
} from "lucide-react";
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

type VoiceMode = "tts" | "s2s";
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

export function AIVoiceView() {
	const [mode, setMode] = useState<VoiceMode>("tts");
	const [text, setText] = useState("");
	const [provider, setProvider] = useState<TTSProvider>("chatterbox");

	// Chatterbox params
	const [exaggeration, setExaggeration] = useState(
		CHATTERBOX_CONFIG.TTS.DEFAULT_EXAGGERATION
	);
	const [cbTemperature, setCbTemperature] = useState(
		CHATTERBOX_CONFIG.TTS.DEFAULT_TEMPERATURE
	);
	const [cfg, setCfg] = useState(CHATTERBOX_CONFIG.TTS.DEFAULT_CFG);
	const [voiceRefUrl, setVoiceRefUrl] = useState("");

	// ElevenLabs params
	const [elVoice, setElVoice] = useState(ELEVENLABS_CONFIG.TTS.DEFAULT_VOICE);
	const [stability, setStability] = useState(
		ELEVENLABS_CONFIG.TTS.DEFAULT_STABILITY
	);
	const [languageCode, setLanguageCode] = useState("");

	// Qwen3 params
	const [qwVoice, setQwVoice] = useState(QWEN3_TTS_CONFIG.TTS.VOICES[0]);
	const [qwLanguage, setQwLanguage] = useState("Auto");
	const [stylePrompt, setStylePrompt] = useState("");
	const [qwTemperature, setQwTemperature] = useState(
		QWEN3_TTS_CONFIG.TTS.DEFAULT_TEMPERATURE
	);
	const [cloneAudioUrl, setCloneAudioUrl] = useState("");
	const [cloneRefText, setCloneRefText] = useState("");
	const [clonedEmbeddingUrl, setClonedEmbeddingUrl] = useState("");
	const [useClonedVoice, setUseClonedVoice] = useState(false);
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

	const handleCloneVoice = useCallback(async () => {
		if (!cloneAudioUrl.trim()) {
			setError("Please provide a reference audio URL for cloning.");
			return;
		}
		setError(null);
		setIsCloning(true);
		try {
			const result = await cloneQwen3Voice({
				endpoint: QWEN3_TTS_CONFIG.TTS.CLONE_ENDPOINT,
				audioUrl: cloneAudioUrl.trim(),
				referenceText: cloneRefText || undefined,
			});
			setClonedEmbeddingUrl(result.embeddingUrl);
			setUseClonedVoice(true);
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
						voice:
							useClonedVoice && clonedEmbeddingUrl
								? undefined
								: qwVoice,
						language: qwLanguage !== "Auto" ? qwLanguage : undefined,
						prompt: stylePrompt || undefined,
						speakerEmbeddingUrl:
							useClonedVoice && clonedEmbeddingUrl
								? clonedEmbeddingUrl
								: undefined,
						referenceText:
							useClonedVoice && cloneRefText
								? cloneRefText
								: undefined,
						temperature: qwTemperature,
					});
					audioUrl = result.audioUrl;
					jobId = result.jobId;
					audioDuration = result.duration;
				}

				const name =
					text.trim().slice(0, 40) + (text.length > 40 ? "..." : "");
				setGeneratedAudio({
					id: jobId,
					name,
					url: audioUrl,
					duration: audioDuration ?? 0,
				});
			} else {
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
				err instanceof Error ? err.message : "Speech generation failed."
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
		useClonedVoice,
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
				</div>

				{mode === "tts" ? (
					<>
						{/* Text input */}
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">Text</Label>
							<Textarea
								placeholder="Enter text to speak..."
								value={text}
								onChange={(e) => setText(e.target.value)}
								className="min-h-[80px] bg-panel-accent"
								maxLength={CHATTERBOX_CONFIG.TTS.MAX_TEXT_LENGTH}
							/>
							<span className="text-xs text-muted-foreground text-right">
								{text.length}/
								{CHATTERBOX_CONFIG.TTS.MAX_TEXT_LENGTH}
							</span>
						</div>

						{/* Provider / model selection */}
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

						{/* Provider-specific controls */}
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
								useClonedVoice={useClonedVoice}
								setUseClonedVoice={setUseClonedVoice}
								cloneAudioUrl={cloneAudioUrl}
								setCloneAudioUrl={setCloneAudioUrl}
								cloneRefText={cloneRefText}
								setCloneRefText={setCloneRefText}
								clonedEmbeddingUrl={clonedEmbeddingUrl}
								isCloning={isCloning}
								onCloneVoice={handleCloneVoice}
							/>
						)}
					</>
				) : (
					<>
						{/* S2S inputs */}
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

				{/* Generate button */}
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

				{/* Error */}
				{error && (
					<p className="text-sm text-destructive">{error}</p>
				)}

				{/* Generated result */}
				{generatedAudio && (
					<div className="flex items-center gap-3 p-3 rounded-md bg-accent">
						<Button
							variant="ghost"
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
	useClonedVoice: boolean;
	setUseClonedVoice: (v: boolean) => void;
	cloneAudioUrl: string;
	setCloneAudioUrl: (v: string) => void;
	cloneRefText: string;
	setCloneRefText: (v: string) => void;
	clonedEmbeddingUrl: string;
	isCloning: boolean;
	onCloneVoice: () => void;
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
	useClonedVoice,
	setUseClonedVoice,
	cloneAudioUrl,
	setCloneAudioUrl,
	cloneRefText,
	setCloneRefText,
	clonedEmbeddingUrl,
	isCloning,
	onCloneVoice,
}: Qwen3ControlsProps) {
	return (
		<>
			{/* Voice source toggle */}
			<div className="flex gap-2">
				<Button
					variant={!useClonedVoice ? "default" : "outline"}
					size="sm"
					onClick={() => setUseClonedVoice(false)}
				>
					Preset Voice
				</Button>
				<Button
					variant={useClonedVoice ? "default" : "outline"}
					size="sm"
					onClick={() => setUseClonedVoice(true)}
				>
					Clone Voice
				</Button>
			</div>

			{!useClonedVoice ? (
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
			) : (
				<div className="flex flex-col gap-2">
					<div className="flex flex-col gap-1.5">
						<Label className="text-xs">
							Reference audio URL
						</Label>
						<input
							type="text"
							placeholder="https://example.com/voice.mp3"
							value={cloneAudioUrl}
							onChange={(e) =>
								setCloneAudioUrl(e.target.value)
							}
							className="h-8 rounded-md border bg-panel-accent px-3 text-sm"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label className="text-xs">
							Reference text (optional)
						</Label>
						<input
							type="text"
							placeholder="What was said in the audio"
							value={cloneRefText}
							onChange={(e) =>
								setCloneRefText(e.target.value)
							}
							className="h-8 rounded-md border bg-panel-accent px-3 text-sm"
						/>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={onCloneVoice}
						disabled={isCloning || !cloneAudioUrl.trim()}
					>
						{isCloning ? (
							<>
								<Loader2Icon className="w-3.5 h-3.5 mr-1.5 animate-spin" />
								Cloning...
							</>
						) : clonedEmbeddingUrl ? (
							"Re-clone Voice"
						) : (
							"Clone Voice"
						)}
					</Button>
					{clonedEmbeddingUrl && (
						<p className="text-xs text-muted-foreground">
							Voice cloned successfully. It will be used for
							generation.
						</p>
					)}
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
				<Label className="text-xs">
					Style prompt (optional)
				</Label>
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
