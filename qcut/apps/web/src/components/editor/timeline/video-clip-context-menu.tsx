import type { MouseEventHandler } from "react";
import {
	AudioLines,
	Camera,
	Captions,
	Check,
	Clapperboard,
	CircleOff,
	ClipboardCopy,
	Copy,
	Download,
	Eye,
	EyeOff,
	FileAudio,
	FolderOpen,
	Gauge,
	Link2,
	Link2Off,
	Music,
	Palette,
	RefreshCw,
	Save,
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
import type { ClipAttributePreset } from "@/lib/timeline/clip-attribute-presets";
import { useTranslation } from "@/lib/i18n";

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
	savePreset: MouseEventHandler<HTMLDivElement>;
	applyPreset: (presetId: string) => void;
	openEffects: MouseEventHandler<HTMLDivElement>;
	toggleGroup: MouseEventHandler<HTMLDivElement>;
	alignAudioVideo: MouseEventHandler<HTMLDivElement>;
	createCompound: MouseEventHandler<HTMLDivElement>;
	createMulticam: MouseEventHandler<HTMLDivElement>;
	breakApart: MouseEventHandler<HTMLDivElement>;
	linkMedia: MouseEventHandler<HTMLDivElement>;
	selectMulticamClip: (clipId: string) => void;
}

interface MulticamClipOption {
	id: string;
	name: string;
	active: boolean;
}

function LimitedBadge() {
	const { t } = useTranslation();

	return (
		<span className="rounded-sm bg-cyan-500/15 px-1 py-0.5 text-[9px] font-medium text-cyan-600 dark:text-cyan-300">
			{t("timeline.menu.test")}
		</span>
	);
}

export function VideoClipContextMenu({
	isDisabled,
	canPasteAttributes,
	hasLocalFile,
	presets,
	canGroup,
	isGrouped,
	canCreateContainer,
	canAlignAudioVideo,
	canLinkMedia,
	compoundKind,
	multicamClips,
	actions,
}: {
	isDisabled: boolean;
	canPasteAttributes: boolean;
	hasLocalFile: boolean;
	presets: ClipAttributePreset[];
	canGroup: boolean;
	isGrouped: boolean;
	canCreateContainer: boolean;
	canAlignAudioVideo: boolean;
	canLinkMedia: boolean;
	compoundKind?: "compound" | "multicam";
	multicamClips: MulticamClipOption[];
	actions: VideoClipMenuActions;
}) {
	const { t } = useTranslation();

	return (
		<ContextMenuContent
			className="z-200 w-[270px] max-h-[calc(100vh-24px)] overflow-y-auto [&_[role=menuitem]]:py-1"
			data-testid="video-clip-context-menu"
		>
			<ContextMenuItem onClick={actions.copy}>
				<Copy />
				{t("timeline.menu.copy")}
				<ContextMenuShortcut>⌘ C</ContextMenuShortcut>
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.cut}>
				<Scissors />
				{t("timeline.menu.cut")}
				<ContextMenuShortcut>⌘ X</ContextMenuShortcut>
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.copyAttributes}>
				<ClipboardCopy />
				{t("timeline.menu.copyAttributes")}
				<ContextMenuShortcut>⌘ ⇧ C</ContextMenuShortcut>
			</ContextMenuItem>
			<ContextMenuItem
				disabled={!canPasteAttributes}
				onClick={actions.pasteAttributes}
			>
				<ClipboardCopy />
				{t("timeline.menu.pasteAttributes")}
				<ContextMenuShortcut>⌘ ⇧ V</ContextMenuShortcut>
			</ContextMenuItem>
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<Save />
					{t("timeline.menu.myPresets")}
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-56">
					<ContextMenuItem onClick={actions.savePreset}>
						<Save />
						{t("timeline.menu.saveAttributes")}
					</ContextMenuItem>
					<ContextMenuSeparator />
					{presets.length > 0 ? (
						presets.map((preset) => (
							<ContextMenuItem
								key={preset.id}
								onClick={(event) => {
									event.stopPropagation();
									actions.applyPreset(preset.id);
								}}
							>
								{preset.name}
							</ContextMenuItem>
						))
					) : (
						<ContextMenuItem disabled>
							{t("timeline.menu.noPresets")}
						</ContextMenuItem>
					)}
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuItem variant="destructive" onClick={actions.remove}>
				<Trash2 />
				{t("common.delete")}
				<ContextMenuShortcut>⌫</ContextMenuShortcut>
			</ContextMenuItem>

			<ContextMenuSeparator />
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<WandSparkles />
					{t("timeline.menu.aiGenerate")}
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-56">
					<ContextMenuItem onClick={actions.openAiTextVideo}>
						<Sparkles />
						{t("timeline.menu.textToVideo")}
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.openAiImageVideo}>
						<Sparkles />
						{t("timeline.menu.imageToVideo")}
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.openAiAudio}>
						<Music />
						{t("timeline.menu.aiAudio")}
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onClick={actions.review}>
						<Sparkles />
						{t("timeline.menu.aiReview")}
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>

			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<Scissors />
					{t("timeline.menu.basicEdit")}
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-56">
					<ContextMenuItem onClick={actions.split}>
						<Scissors />
						{t("timeline.menu.splitAtPlayhead")}
						<ContextMenuShortcut>S</ContextMenuShortcut>
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.keepLeft}>
						<SplitSquareHorizontal />
						{t("timeline.menu.keepLeft")}
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.keepRight}>
						<SplitSquareHorizontal />
						{t("timeline.menu.keepRight")}
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.duplicate}>
						<Copy />
						{t("timeline.menu.duplicate")}
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>

			<ContextMenuItem onClick={actions.smartShotSplit}>
				<SplitSquareHorizontal />
				{t("timeline.menu.smartShotSplit")}
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.openSmartSpeech}>
				<AudioLines />
				{t("timeline.menu.smartSpeech")}
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.recognizeSpeech}>
				<Captions />
				{t("timeline.menu.recognize")}
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.openAiAudio}>
				<Sparkles />
				{t("timeline.menu.generateAiAudio")}
				<LimitedBadge />
			</ContextMenuItem>
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<AudioLines />
					{t("timeline.menu.voiceSeparation")}
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-56">
					<ContextMenuItem onClick={actions.openVoiceSeparation}>
						<AudioLines />
						{t("timeline.menu.separateVocalsMusic")}
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.separateAudio}>
						<FileAudio />
						{t("timeline.menu.extractTrack")}
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuItem onClick={actions.separateAudio}>
				<FileAudio />
				{t("timeline.menu.separateAudio")}
			</ContextMenuItem>
			<ContextMenuItem
				disabled={!canAlignAudioVideo}
				onClick={actions.alignAudioVideo}
			>
				<Link2Off />
				{t("timeline.menu.alignAv")}
			</ContextMenuItem>

			<ContextMenuSeparator />
			{compoundKind ? (
				<ContextMenuItem onClick={actions.breakApart}>
					<Copy />
					{t(
						compoundKind === "multicam"
							? "timeline.menu.breakMulticam"
							: "timeline.menu.breakCompound"
					)}
				</ContextMenuItem>
			) : (
				<>
					<ContextMenuItem
						disabled={!canCreateContainer}
						onClick={actions.createCompound}
					>
						<Clapperboard />
						{t("timeline.menu.createCompound")}
					</ContextMenuItem>
					<ContextMenuItem
						disabled={!canCreateContainer}
						onClick={actions.createMulticam}
					>
						<Camera />
						{t("timeline.menu.createMulticam")}
					</ContextMenuItem>
				</>
			)}
			{compoundKind === "multicam" && multicamClips.length > 0 ? (
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<Camera />
						{t("timeline.menu.switchCamera")}
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-56">
						{multicamClips.map((clip) => (
							<ContextMenuItem
								key={clip.id}
								onClick={(event) => {
									event.stopPropagation();
									actions.selectMulticamClip(clip.id);
								}}
							>
								{clip.active ? <Check /> : <span className="size-4" />}
								{clip.name}
							</ContextMenuItem>
						))}
					</ContextMenuSubContent>
				</ContextMenuSub>
			) : null}
			<ContextMenuItem
				disabled={!canGroup && !isGrouped}
				onClick={actions.toggleGroup}
			>
				{isGrouped ? <Link2Off /> : <Link2 />}
				{isGrouped ? t("timeline.menu.ungroup") : t("timeline.menu.group")}
			</ContextMenuItem>

			<ContextMenuSeparator />
			<ContextMenuItem onClick={actions.exportClip}>
				<Download />
				{t("timeline.menu.exportSelected")}
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.toggleDisabled}>
				{isDisabled ? <Eye /> : <EyeOff />}
				{isDisabled ? t("timeline.menu.enable") : t("timeline.menu.disable")}
				<ContextMenuShortcut>V</ContextMenuShortcut>
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.relink}>
				<RefreshCw />
				{t("timeline.menu.relink")}
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.replace}>
				<RefreshCw />
				{t("timeline.menu.replace")}
			</ContextMenuItem>
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<Palette />
					LUT
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-48">
					<ContextMenuItem onClick={actions.openLut}>
						<Palette />
						{t("timeline.menu.openLut")}
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.disableLut}>
						<CircleOff />
						{t("timeline.menu.disableLut")}
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuItem disabled={!canLinkMedia} onClick={actions.linkMedia}>
				<Link2Off />
				{t("timeline.menu.linkMedia")}
			</ContextMenuItem>
			<ContextMenuItem
				disabled={!hasLocalFile}
				onClick={actions.openFileLocation}
			>
				<FolderOpen />
				{t("timeline.menu.openLocation")}
			</ContextMenuItem>

			<ContextMenuSeparator />
			<ContextMenuItem onClick={actions.openEffects}>
				<Sparkles />
				{t("timeline.menu.editEffects")}
			</ContextMenuItem>
			<ContextMenuItem onClick={actions.openSpeed}>
				<Gauge />
				{t("timeline.menu.speed")}
			</ContextMenuItem>
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<Scissors />
					{t("timeline.menu.timeRange")}
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-56">
					<ContextMenuItem onClick={actions.keepLeft}>
						{t("timeline.menu.setOut")}
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.keepRight}>
						{t("timeline.menu.setIn")}
					</ContextMenuItem>
					<ContextMenuItem onClick={actions.resetRange}>
						<RefreshCw />
						{t("timeline.menu.resetRange")}
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<Download />
					{t("timeline.menu.render")}
				</ContextMenuSubTrigger>
				<ContextMenuSubContent className="w-52">
					<ContextMenuItem onClick={actions.exportClip}>
						<Download />
						{t("timeline.menu.renderSelected")}
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>
		</ContextMenuContent>
	);
}
