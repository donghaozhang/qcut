import type { MouseEventHandler } from "react";
import {
	AudioLines,
	Captions,
	CircleOff,
	ClipboardCopy,
	Copy,
	Download,
	Eye,
	EyeOff,
	FileAudio,
	FolderOpen,
	Gauge,
	Link2Off,
	Music,
	Palette,
	RefreshCw,
	Scissors,
	Sparkles,
	SplitSquareHorizontal,
	Trash2,
	WandSparkles,
} from "lucide-react";
import {
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@/components/ui/context-menu";

interface VideoClipMenuActions {
	copy: MouseEventHandler<HTMLDivElement>;
	cut: MouseEventHandler<HTMLDivElement>;
	copyAttributes: MouseEventHandler<HTMLDivElement>;
	pasteAttributes: MouseEventHandler<HTMLDivElement>;
	remove: MouseEventHandler<HTMLDivElement>;
	duplicate: MouseEventHandler<HTMLDivElement>;
	split: MouseEventHandler<HTMLDivElement>;
	keepLeft: MouseEventHandler<HTMLDivElement>;
	keepRight: MouseEventHandler<HTMLDivElement>;
	smartShotSplit: MouseEventHandler<HTMLDivElement>;
	openAiTextVideo: MouseEventHandler<HTMLDivElement>;
	openAiImageVideo: MouseEventHandler<HTMLDivElement>;
	openAiAudio: MouseEventHandler<HTMLDivElement>;
	review: MouseEventHandler<HTMLDivElement>;
	openSmartSpeech: MouseEventHandler<HTMLDivElement>;
	recognizeSpeech: MouseEventHandler<HTMLDivElement>;
	openVoiceSeparation: MouseEventHandler<HTMLDivElement>;
	separateAudio: MouseEventHandler<HTMLDivElement>;
	exportClip: MouseEventHandler<HTMLDivElement>;
	toggleDisabled: MouseEventHandler<HTMLDivElement>;
	relink: MouseEventHandler<HTMLDivElement>;
	replace: MouseEventHandler<HTMLDivElement>;
	openLut: MouseEventHandler<HTMLDivElement>;
	disableLut: MouseEventHandler<HTMLDivElement>;
	openFileLocation: MouseEventHandler<HTMLDivElement>;
	resetRange: MouseEventHandler<HTMLDivElement>;
	openSpeed: MouseEventHandler<HTMLDivElement>;
}

function LimitedBadge() {
	return (
		<span className="rounded-sm bg-cyan-500/15 px-1 py-0.5 text-[9px] font-medium text-cyan-600 dark:text-cyan-300">
			BETA
		</span>
	);
}

export function VideoClipContextMenu({
	isDisabled,
	canPasteAttributes,
	hasLocalFile,
	actions,
}: {
	isDisabled: boolean;
	canPasteAttributes: boolean;
	hasLocalFile: boolean;
	actions: VideoClipMenuActions;
}) {
	return (
		<ContextMenuContent
			className="z-200 w-[270px] max-h-[calc(100vh-24px)] overflow-y-auto [&_[role=menuitem]]:py-1"
			data-testid="video-clip-context-menu"
		>
			<ContextMenuItem onClick={actions.copy}>
				<Copy />
				Copy
				<ContextMenuShortcut>⌘ C</ContextMenuShortcut>
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.cut}>
				<Scissors />
				Cut
				<ContextMenuShortcut>⌘ X</ContextMenuShortcut>
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.copyAttributes}>
				<ClipboardCopy />
				Copy Attributes
				<ContextMenuShortcut>⌘ ⇧ C</ContextMenuShortcut>
			</ContextMenuItem>
			<ContextMenuItem
				disabled={!canPasteAttributes}
				onClick={actions.pasteAttributes}
			>
				<ClipboardCopy />
				Paste Attributes
				<ContextMenuShortcut>⌘ ⇧ V</ContextMenuShortcut>
			</ContextMenuItem>
			<ContextMenuItem variant="destructive" onClick={actions.remove}>
				<Trash2 />
				Delete
				<ContextMenuShortcut>⌫</ContextMenuShortcut>
			</ContextMenuItem>

			<ContextMenuSeparator />
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<WandSparkles />
					AI Generate
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-56">
					<ContextMenuItem onClick={actions.openAiTextVideo}>
						<Sparkles />
						Text to Video
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.openAiImageVideo}>
						<Sparkles />
						Image to Video
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.openAiAudio}>
						<Music />
						AI Sound Effect
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onClick={actions.review}>
						<Sparkles />
						AI Review Selected Clip
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>

			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<Scissors />
					Basic Edit
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-56">
					<ContextMenuItem onClick={actions.split}>
						<Scissors />
						Split at Playhead
						<ContextMenuShortcut>S</ContextMenuShortcut>
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.keepLeft}>
						<SplitSquareHorizontal />
						Split and Keep Left
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.keepRight}>
						<SplitSquareHorizontal />
						Split and Keep Right
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.duplicate}>
						<Copy />
						Duplicate
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>

			<ContextMenuItem onClick={actions.smartShotSplit}>
				<SplitSquareHorizontal />
				Smart Shot Split
			</ContextMenuItem>
			<ContextMenuItem disabled>
				<Sparkles />
				Smart Album
				<LimitedBadge />
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.openSmartSpeech}>
				<AudioLines />
				Smart Speech Edit
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.recognizeSpeech}>
				<Captions />
				Recognize Speech / Captions
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.openAiAudio}>
				<Sparkles />
				Generate AI Sound Effect
				<LimitedBadge />
			</ContextMenuItem>
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<AudioLines />
					Voice Separation
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-56">
					<ContextMenuItem onClick={actions.openVoiceSeparation}>
						<AudioLines />
						Separate Voice and Music
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.separateAudio}>
						<FileAudio />
						Extract Audio Track
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuItem onClick={actions.separateAudio}>
				<FileAudio />
				Separate Audio
			</ContextMenuItem>
			<ContextMenuItem disabled>
				<Link2Off />
				Audio / Video Alignment
			</ContextMenuItem>

			<ContextMenuSeparator />
			<ContextMenuItem disabled>
				<Copy />
				New Compound Clip
			</ContextMenuItem>
			<ContextMenuItem disabled>
				<Copy />
				New Multicam Clip
			</ContextMenuItem>
			<ContextMenuItem disabled>
				<ClipboardCopy />
				Save as My Preset
			</ContextMenuItem>
			<ContextMenuItem disabled>
				<Link2Off />
				Create Group
			</ContextMenuItem>

			<ContextMenuSeparator />
			<ContextMenuItem onClick={actions.exportClip}>
				<Download />
				Export Selected Clip
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.toggleDisabled}>
				{isDisabled ? <Eye /> : <EyeOff />}
				{isDisabled ? "Enable Clip" : "Disable Clip"}
				<ContextMenuShortcut>V</ContextMenuShortcut>
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.relink}>
				<RefreshCw />
				Relink Clip
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.replace}>
				<RefreshCw />
				Replace Clip
			</ContextMenuItem>
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<Palette />
					LUT
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-48">
					<ContextMenuItem onClick={actions.openLut}>
						<Palette />
						Open LUT Controls
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.disableLut}>
						<CircleOff />
						Disable LUT
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuItem disabled>
				<Link2Off />
				Link Media
			</ContextMenuItem>
			<ContextMenuItem
				disabled={!hasLocalFile}
				onClick={actions.openFileLocation}
			>
				<FolderOpen />
				Open File Location
			</ContextMenuItem>

			<ContextMenuSeparator />
			<ContextMenuItem disabled>
				<Sparkles />
				Edit Effects
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.openSpeed}>
				<Gauge />
				Speed Controls
			</ContextMenuItem>
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<Scissors />
					Time Range
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-56">
					<ContextMenuItem onClick={actions.keepLeft}>
						Set Out at Playhead
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.keepRight}>
						Set In at Playhead
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.resetRange}>
						<RefreshCw />
						Reset Source Range
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<Download />
					Render
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-52">
					<ContextMenuItem onClick={actions.exportClip}>
						<Download />
						Render Selected Clip
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>
		</ContextMenuContent>
	);
}
