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
				<Label className="text-xs">情绪标签</Label>
				<div className="flex flex-wrap gap-1">
					{CHATTERBOX_CONFIG.TTS.EMOTIVE_TAGS.map((tag) => (
						<Button
							key={tag}
							type="button"
							variant="outline"
							size="sm"
							className="text-xs h-6 px-2"
							onClick={() => insertTag(tag)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.currentTarget.click();
								}
							}}
						>
							{tag}
						</Button>
					))}
				</div>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">参考音色 URL（可选）</Label>
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
					label="表现力"
					value={exaggeration}
					onChange={setExaggeration}
					min={0}
					max={1}
					step={0.05}
				/>
				<SliderControl
					label="随机度"
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
				<Label className="text-xs">音色</Label>
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
				label="稳定度"
				value={stability}
				onChange={setStability}
				min={0}
				max={1}
				step={0.05}
			/>
			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">语言代码（可选，例如“zh”“en”）</Label>
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
						正在使用克隆音色。如需更改，请切换到“音色克隆”。
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-1.5">
					<Label className="text-xs">音色</Label>
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
				<Label className="text-xs">语言</Label>
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
				<Label className="text-xs">风格提示词（可选）</Label>
				<input
					type="text"
					placeholder="例如：用轻快、自然的语气朗读"
					value={stylePrompt}
					onChange={(e) => setStylePrompt(e.target.value)}
					className="h-8 rounded-md border bg-panel-accent px-3 text-sm"
				/>
			</div>

			<SliderControl
				label="随机度"
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
				上传一段参考音频来克隆音色。克隆结果可用于 Qwen3 TTS 文本转语音。
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
						<p className="text-sm font-medium truncate">{cloneFile.name}</p>
						<p className="text-xs text-muted-foreground">
							{formatFileSize(cloneFile.size)}
						</p>
					</div>
					<Button
						type="button"
						variant="text"
						size="icon"
						className="shrink-0"
						onClick={onClearFile}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.currentTarget.click();
							}
						}}
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
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							fileInputRef.current?.click();
						}
					}}
					role="button"
					tabIndex={0}
					{...dragProps}
				>
					<div className="text-center space-y-2">
						<div className="mx-auto size-10 rounded-full bg-muted flex items-center justify-center">
							<UploadIcon className="size-5 text-muted-foreground" />
						</div>
						<div>
							<p className="text-sm font-medium">拖放音频到这里</p>
							<p className="text-xs text-muted-foreground">
								或点击选择文件，支持 MP3、WAV、AAC，最大 10 MB
							</p>
						</div>
					</div>
				</div>
			)}

			{/* Reference text */}
			<div className="flex flex-col gap-1.5">
				<Label className="text-xs">参考文本（可选，即音频中说了什么）</Label>
				<input
					type="text"
					placeholder="输入参考音频中的文字"
					value={cloneRefText}
					onChange={(e) => setCloneRefText(e.target.value)}
					className="h-8 rounded-md border bg-panel-accent px-3 text-sm"
				/>
			</div>

			{clonedEmbeddingUrl && (
				<div className="p-2 rounded-md bg-accent">
					<p className="text-xs text-muted-foreground">
						克隆音色已就绪，可以直接使用
					</p>
				</div>
			)}
		</>
	);
}
