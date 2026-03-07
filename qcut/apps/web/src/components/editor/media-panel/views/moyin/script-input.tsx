/**
 * ScriptInput — Left panel: script input with Import/Create tabs,
 * language/scene/shot config, visual style picker, and API key warning.
 */

import { useState, useMemo } from "react";
import { useMoyinStore } from "@/stores/moyin/moyin-store";
import { MODEL_OPTIONS } from "@/stores/moyin/moyin-parse-actions";
import { ImportProgress } from "./import-progress";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	AlertTriangleIcon,
	BookOpenIcon,
	Loader2,
	SparklesIcon,
	Trash2Icon,
} from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	EXAMPLE_SCRIPTS,
	type ExampleScriptStructure,
} from "@/lib/moyin/script/example-scripts";
import {
	EXAMPLE_NOVEL_EN,
	EXAMPLE_NOVEL_ZH,
} from "@/stores/moyin/moyin-novel-import";
import { VISUAL_STYLE_PRESETS } from "@/lib/moyin/presets/visual-styles";
import { CINEMATOGRAPHY_PROFILES } from "@/lib/moyin/presets/cinematography-profiles";

type InputTab = "import" | "create" | "novel";

const GENRE_OPTIONS = [
	{ value: "drama", label: "Drama" },
	{ value: "comedy", label: "Comedy" },
	{ value: "thriller", label: "Thriller" },
	{ value: "romance", label: "Romance" },
	{ value: "sci-fi", label: "Sci-Fi" },
	{ value: "horror", label: "Horror" },
	{ value: "action", label: "Action" },
	{ value: "documentary", label: "Documentary" },
	{ value: "commercial", label: "Commercial / Ad" },
	{ value: "music-video", label: "Music Video" },
];

const DURATION_OPTIONS = [
	{ value: "15s", label: "15s" },
	{ value: "30s", label: "30s" },
	{ value: "60s", label: "60s" },
	{ value: "90s", label: "90s" },
	{ value: "120s", label: "2 min" },
	{ value: "180s", label: "3 min" },
	{ value: "300s", label: "5 min" },
];

const LANGUAGE_OPTIONS = [
	{ value: "English", label: "English" },
	{ value: "中文", label: "中文" },
	{ value: "日本語", label: "日本語" },
];

const SCENE_COUNT_OPTIONS = [
	{ value: "auto", label: "Auto" },
	...Array.from({ length: 10 }, (_, i) => ({
		value: String(i + 1),
		label: String(i + 1),
	})),
];

const SHOT_COUNT_OPTIONS = [
	{ value: "auto", label: "Auto" },
	...Array.from({ length: 10 }, (_, i) => ({
		value: String(i + 3),
		label: String(i + 3),
	})),
];

const CATEGORY_LABELS: Record<string, string> = {
	"3d": "3D Styles",
	"2d": "2D / Anime",
	real: "Realistic / Film",
	stop_motion: "Stop Motion",
};

function useGroupedStyles() {
	return useMemo(() => {
		const groups: Record<string, typeof VISUAL_STYLE_PRESETS> = {};
		for (const preset of VISUAL_STYLE_PRESETS) {
			const cat = preset.category;
			if (!groups[cat]) groups[cat] = [];
			(groups[cat] as (typeof VISUAL_STYLE_PRESETS)[number][]).push(preset);
		}
		return groups;
	}, []);
}

export function ScriptInput() {
	const [activeTab, setActiveTab] = useState<InputTab>("import");
	const [createIdea, setCreateIdea] = useState("");
	const [createGenre, setCreateGenre] = useState("drama");
	const [createDuration, setCreateDuration] = useState("60s");
	const [novelText, setNovelText] = useState("");

	const rawScript = useMoyinStore((s) => s.rawScript);
	const setRawScript = useMoyinStore((s) => s.setRawScript);
	const parseStatus = useMoyinStore((s) => s.parseStatus);
	const parseError = useMoyinStore((s) => s.parseError);
	const parseScript = useMoyinStore((s) => s.parseScript);
	const parseNovel = useMoyinStore((s) => s.parseNovel);
	const clearScript = useMoyinStore((s) => s.clearScript);
	const chatConfigured = useMoyinStore((s) => s.chatConfigured);
	const generateScript = useMoyinStore((s) => s.generateScript);
	const createStatus = useMoyinStore((s) => s.createStatus);
	const createError = useMoyinStore((s) => s.createError);

	const language = useMoyinStore((s) => s.language);
	const setLanguage = useMoyinStore((s) => s.setLanguage);
	const sceneCount = useMoyinStore((s) => s.sceneCount);
	const setSceneCount = useMoyinStore((s) => s.setSceneCount);
	const shotCount = useMoyinStore((s) => s.shotCount);
	const setShotCount = useMoyinStore((s) => s.setShotCount);

	const parseModel = useMoyinStore((s) => s.parseModel);
	const setParseModel = useMoyinStore((s) => s.setParseModel);
	const selectedStyleId = useMoyinStore((s) => s.selectedStyleId);
	const setSelectedStyleId = useMoyinStore((s) => s.setSelectedStyleId);
	const selectedProfileId = useMoyinStore((s) => s.selectedProfileId);
	const setSelectedProfileId = useMoyinStore((s) => s.setSelectedProfileId);

	const groupedStyles = useGroupedStyles();

	const isParsing = parseStatus === "parsing";
	const canParse = rawScript.trim().length > 0 && !isParsing;

	/** Load an example with pre-parsed structure into the store */
	const loadExample = (
		content: string,
		lang: string,
		structure: ExampleScriptStructure
	) => {
		useMoyinStore.setState({
			rawScript: content,
			language: lang,
			scriptData: structure.scriptData,
			characters: structure.characters,
			scenes: structure.scenes,
			episodes: structure.episodes,
			shots: structure.shots,
			parseStatus: "ready",
			activeStep: "characters",
		});
	};

	const selectedStyle = VISUAL_STYLE_PRESETS.find(
		(s) => s.id === selectedStyleId
	);

	return (
		<div className="space-y-3">
			{/* API Key Warning */}
			{!chatConfigured && (
				<div className="flex items-start gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-2.5 text-xs text-yellow-700 dark:text-yellow-400">
					<AlertTriangleIcon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
					<div>
						<p className="font-medium">API Not Configured</p>
						<p className="text-[10px] opacity-80">
							Configure an API key in Settings to enable AI parsing.
						</p>
					</div>
				</div>
			)}

			{/* Workflow guide — shows only on initial empty state */}
			{parseStatus === "idle" && !rawScript.trim() && (
				<div className="rounded-md border bg-muted/30 p-2.5 space-y-1.5">
					<p className="text-[10px] font-medium">Quick Start</p>
					<ol className="text-[10px] text-muted-foreground space-y-0.5 list-decimal list-inside">
						<li>Import a screenplay or create one with AI</li>
						<li>Review extracted characters & scenes</li>
						<li>Generate storyboard & shot images/videos</li>
					</ol>
				</div>
			)}

			{/* Import / Create / Novel tabs */}
			<div className="flex border-b" role="tablist">
				{(["import", "create", "novel"] as const).map((tab) => (
					<button
						key={tab}
						type="button"
						role="tab"
						id={`tab-button-${tab}`}
						aria-selected={activeTab === tab}
						aria-controls={`tab-${tab}`}
						onClick={() => setActiveTab(tab)}
						className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
							activeTab === tab
								? "border-primary text-primary"
								: "border-transparent text-muted-foreground hover:text-foreground"
						}`}
					>
						{tab === "import" ? "Import" : tab === "create" ? "Create" : "Novel"}
					</button>
				))}
			</div>

			{/* Tab content */}
			{activeTab === "import" ? (
				<div
					id="tab-import"
					role="tabpanel"
					aria-labelledby="tab-button-import"
					className="space-y-3"
				>
					<Textarea
						id="moyin-script-input"
						value={rawScript}
						onChange={(e) => setRawScript(e.target.value)}
						placeholder="Paste screenplay text here... Supports any language."
						className="min-h-[160px] resize-y text-sm font-mono"
						disabled={isParsing}
					/>

					{!rawScript.trim() && !isParsing && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="sm" className="w-full">
									<BookOpenIcon className="mr-1.5 h-3.5 w-3.5" />
									Load Example Script
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="w-64">
								{EXAMPLE_SCRIPTS.map((ex) => (
									<DropdownMenuItem
										key={ex.id}
										onClick={() => {
											loadExample(ex.content, ex.language, ex.structure);
										}}
									>
										<div className="flex flex-col gap-0.5">
											<span className="text-xs font-medium">{ex.label}</span>
											<span className="text-[10px] text-muted-foreground">
												{ex.description}
											</span>
										</div>
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					{parseError && (
						<div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
							{parseError}
						</div>
					)}

					<div className="flex items-center gap-2">
						<Button
							onClick={parseScript}
							disabled={!canParse}
							className="flex-1"
							size="sm"
						>
							{isParsing ? (
								<>
									<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
									Parsing...
								</>
							) : (
								<>
									<SparklesIcon className="mr-1.5 h-3.5 w-3.5" />
									Parse Script
								</>
							)}
						</Button>

						{rawScript.length > 0 && (
							<Button
								variant="outline"
								size="sm"
								onClick={clearScript}
								disabled={isParsing}
								title="Clear script"
								aria-label="Clear script"
							>
								<Trash2Icon className="h-3.5 w-3.5" />
							</Button>
						)}
					</div>

					<p className="text-xs text-muted-foreground">
						AI will extract characters, scenes, and story structure from your
						text.
					</p>

					<ImportProgress />
				</div>
			) : (
				<div
					id="tab-create"
					role="tabpanel"
					aria-labelledby="tab-button-create"
					className="space-y-3"
				>
					<div className="space-y-1">
						<Label className="text-xs">Genre</Label>
						<Select value={createGenre} onValueChange={setCreateGenre}>
							<SelectTrigger className="h-7 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{GENRE_OPTIONS.map((opt) => (
									<SelectItem
										key={opt.value}
										value={opt.value}
										className="text-xs"
									>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-1">
						<Label className="text-xs">Target Duration</Label>
						<Select value={createDuration} onValueChange={setCreateDuration}>
							<SelectTrigger className="h-7 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{DURATION_OPTIONS.map((opt) => (
									<SelectItem
										key={opt.value}
										value={opt.value}
										className="text-xs"
									>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-1">
						<Label className="text-xs">Synopsis / Idea</Label>
						<Textarea
							value={createIdea}
							onChange={(e) => setCreateIdea(e.target.value)}
							placeholder="Describe your story idea, concept, or synopsis..."
							className="min-h-[120px] resize-y text-sm"
							disabled={createStatus === "generating"}
						/>
					</div>

					{createError && (
						<div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
							{createError}
						</div>
					)}

					<Button
						onClick={async () => {
							const idea = `[Genre: ${createGenre}]\n\n${createIdea}`;
							await generateScript(idea, {
								genre: createGenre,
								targetDuration: createDuration,
							});
							setActiveTab("import");
						}}
						disabled={!createIdea.trim() || createStatus === "generating"}
						className="w-full"
						size="sm"
					>
						{createStatus === "generating" ? (
							<>
								<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
								Generating...
							</>
						) : (
							<>
								<SparklesIcon className="mr-1.5 h-3.5 w-3.5" />
								Generate Script
							</>
						)}
					</Button>

					<p className="text-xs text-muted-foreground">
						AI will generate a screenplay from your idea, then switch to Import
						for review and parsing.
					</p>
				</div>
			)}

			{/* Config section */}
			<div className="space-y-2.5 border-t pt-3">
				<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
					Configuration
				</p>

				{/* Language */}
				<div className="space-y-1">
					<Label className="text-xs">Language</Label>
					<Select value={language} onValueChange={setLanguage}>
						<SelectTrigger className="h-7 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{LANGUAGE_OPTIONS.map((opt) => (
								<SelectItem
									key={opt.value}
									value={opt.value}
									className="text-xs"
								>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Parse Model */}
				<div className="space-y-1">
					<Label className="text-xs">Parse Model</Label>
					<Select value={parseModel} onValueChange={setParseModel}>
						<SelectTrigger className="h-7 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{MODEL_OPTIONS.map((opt) => (
								<SelectItem
									key={opt.value}
									value={opt.value}
									className="text-xs"
								>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Scene Count / Shot Count */}
				<div className="grid grid-cols-2 gap-2">
					<div className="space-y-1">
						<Label className="text-xs">Scene Count</Label>
						<Select value={sceneCount} onValueChange={setSceneCount}>
							<SelectTrigger className="h-7 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{SCENE_COUNT_OPTIONS.map((opt) => (
									<SelectItem
										key={opt.value}
										value={opt.value}
										className="text-xs"
									>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1">
						<Label className="text-xs">Shot Count</Label>
						<Select value={shotCount} onValueChange={setShotCount}>
							<SelectTrigger className="h-7 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{SHOT_COUNT_OPTIONS.map((opt) => (
									<SelectItem
										key={opt.value}
										value={opt.value}
										className="text-xs"
									>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				{/* Visual Style */}
				<div className="space-y-1">
					<Label className="text-xs">Visual Style</Label>
					<Select value={selectedStyleId} onValueChange={setSelectedStyleId}>
						<SelectTrigger className="h-7 text-xs">
							<SelectValue placeholder="Select style" />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(groupedStyles).map(([category, presets]) => (
								<SelectGroup key={category}>
									<SelectLabel className="text-[10px] uppercase tracking-wider">
										{CATEGORY_LABELS[category] || category}
									</SelectLabel>
									{(presets as (typeof VISUAL_STYLE_PRESETS)[number][]).map(
										(preset) => (
											<SelectItem
												key={preset.id}
												value={preset.id}
												className="text-xs"
											>
												{preset.name}
											</SelectItem>
										)
									)}
								</SelectGroup>
							))}
						</SelectContent>
					</Select>
					{selectedStyle && (
						<p className="text-[10px] text-muted-foreground line-clamp-1">
							{selectedStyle.description}
						</p>
					)}
				</div>

				{/* Camera Profile */}
				<div className="space-y-1">
					<Label className="text-xs">Camera Profile</Label>
					<Select
						value={selectedProfileId}
						onValueChange={setSelectedProfileId}
					>
						<SelectTrigger className="h-7 text-xs">
							<SelectValue placeholder="Select profile" />
						</SelectTrigger>
						<SelectContent>
							{CINEMATOGRAPHY_PROFILES.map((profile) => (
								<SelectItem
									key={profile.id}
									value={profile.id}
									className="text-xs"
								>
									{profile.emoji} {profile.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>
		</div>
	);
}
