/**
 * AI Voice Tab for Sounds Panel
 *
 * Text-to-speech and speech-to-speech generation using Chatterbox via FAL.ai.
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
import { CHATTERBOX_CONFIG } from "@/components/editor/media-panel/views/ai/constants/ai-constants";
import {
	generateSpeech,
	convertSpeech,
} from "@/lib/ai-video/generators/speech";
import type { SoundEffect } from "@/types/sounds";

type VoiceMode = "tts" | "s2s";
type TTSModel = "standard" | "turbo";

interface GeneratedAudio {
	id: string;
	name: string;
	url: string;
	duration: number;
}

export function AIVoiceView() {
	const [mode, setMode] = useState<VoiceMode>("tts");
	const [text, setText] = useState("");
	const [ttsModel, setTtsModel] = useState<TTSModel>("standard");
	const [exaggeration, setExaggeration] = useState(
		CHATTERBOX_CONFIG.TTS.DEFAULT_EXAGGERATION
	);
	const [temperature, setTemperature] = useState(
		CHATTERBOX_CONFIG.TTS.DEFAULT_TEMPERATURE
	);
	const [cfg, setCfg] = useState(CHATTERBOX_CONFIG.TTS.DEFAULT_CFG);
	const [voiceRefUrl, setVoiceRefUrl] = useState("");
	const [sourceAudioUrl, setSourceAudioUrl] = useState("");
	const [targetVoiceUrl, setTargetVoiceUrl] = useState("");
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

	const insertTag = useCallback(
		(tag: string) => {
			setText((prev) => `${prev}<${tag}>`);
		},
		[]
	);

	const handleGenerate = useCallback(async () => {
		setError(null);
		setIsGenerating(true);

		try {
			if (mode === "tts") {
				if (!text.trim()) {
					setError("Please enter text to generate speech.");
					return;
				}

				const endpoint =
					ttsModel === "turbo"
						? CHATTERBOX_CONFIG.TTS.TURBO_ENDPOINT
						: CHATTERBOX_CONFIG.TTS.ENDPOINT;

				const result = await generateSpeech({
					text: text.trim(),
					endpoint,
					audioUrl: voiceRefUrl || undefined,
					exaggeration,
					temperature,
					cfg,
				});

				const name = text.trim().slice(0, 40) + (text.length > 40 ? "..." : "");
				setGeneratedAudio({
					id: result.jobId,
					name,
					url: result.audioUrl,
					duration: 0,
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
		ttsModel,
		voiceRefUrl,
		exaggeration,
		temperature,
		cfg,
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
			username: "Chatterbox",
			tags: ["ai", "speech", "tts"],
			license: "generated",
			created: new Date().toISOString(),
			downloads: 0,
			rating: 0,
			ratingCount: 0,
		};

		await addSoundToTimeline(soundEffect);
	}, [generatedAudio, addSoundToTimeline]);

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
								{text.length}/{CHATTERBOX_CONFIG.TTS.MAX_TEXT_LENGTH}
							</span>
						</div>

						{/* Emotive tags */}
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

						{/* Voice reference */}
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">Voice reference URL (optional)</Label>
							<input
								type="text"
								placeholder="https://example.com/voice.mp3"
								value={voiceRefUrl}
								onChange={(e) => setVoiceRefUrl(e.target.value)}
								className="h-8 rounded-md border bg-panel-accent px-3 text-sm"
							/>
						</div>

						{/* Model selection */}
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">Model</Label>
							<Select
								value={ttsModel}
								onValueChange={(v) => setTtsModel(v as TTSModel)}
							>
								<SelectTrigger className="h-8 bg-panel-accent">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="standard">Standard</SelectItem>
									<SelectItem value="turbo">Turbo (faster)</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Sliders */}
						<div className="flex flex-col gap-3">
							<div className="flex flex-col gap-1.5">
								<div className="flex items-center justify-between">
									<Label className="text-xs">Exaggeration</Label>
									<span className="text-xs text-muted-foreground">
										{exaggeration.toFixed(2)}
									</span>
								</div>
								<Slider
									value={[exaggeration]}
									onValueChange={([v]) => setExaggeration(v)}
									min={0}
									max={1}
									step={0.05}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<div className="flex items-center justify-between">
									<Label className="text-xs">Temperature</Label>
									<span className="text-xs text-muted-foreground">
										{temperature.toFixed(2)}
									</span>
								</div>
								<Slider
									value={[temperature]}
									onValueChange={([v]) => setTemperature(v)}
									min={0.05}
									max={2.0}
									step={0.05}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<div className="flex items-center justify-between">
									<Label className="text-xs">CFG</Label>
									<span className="text-xs text-muted-foreground">
										{cfg.toFixed(2)}
									</span>
								</div>
								<Slider
									value={[cfg]}
									onValueChange={([v]) => setCfg(v)}
									min={0.1}
									max={1.0}
									step={0.05}
								/>
							</div>
						</div>
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
								onChange={(e) => setSourceAudioUrl(e.target.value)}
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
								onChange={(e) => setTargetVoiceUrl(e.target.value)}
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
							<p className="text-xs text-muted-foreground">AI Generated</p>
						</div>
						<Button size="sm" variant="outline" onClick={handleAddToTimeline}>
							+ Timeline
						</Button>
					</div>
				)}
			</div>
		</ScrollArea>
	);
}
