/**
 * Provider-specific control components for AI Voice panel.
 *
 * Extracted from sounds-ai-voice.tsx to keep files under 800 lines.
 */

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { MicIcon, UploadIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDragDrop } from "@/hooks/use-drag-drop";
import {
	CHATTERBOX_CONFIG,
	ELEVENLABS_CONFIG,
	QWEN3_TTS_CONFIG,
} from "@/components/editor/media-panel/views/ai/constants/ai-constants";

// ── Shared slider control ────────────────────────────────────────────

interface SliderControlProps {
	label: string;
	value: number;
	onChange: (v: number) => void;
	min: number;
	max: number;
	step: number;
}

export function SliderControl({
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

// ── Chatterbox controls ──────────────────────────────────────────────

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

export function ChatterboxControls({
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

// ── ElevenLabs controls ──────────────────────────────────────────────

interface ElevenLabsControlsProps {
	voice: string;
	setVoice: (v: string) => void;
	stability: number;
	setStability: (v: number) => void;
	languageCode: string;
	setLanguageCode: (v: string) => void;
}

export function ElevenLabsControls({
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

// ── Qwen3 controls ──────────────────────────────────────────────────

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

export function Qwen3Controls({
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

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface VoiceCloneControlsProps {
	cloneFile: File | null;
	onFileSelect: (file: File) => void;
	onClearFile: () => void;
	cloneRefText: string;
	setCloneRefText: (v: string) => void;
	clonedEmbeddingUrl: string;
}

export function VoiceCloneControls({
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
