/**
 * Shared mock implementations for moyin test files.
 *
 * Each test file uses vi.mock() with async factories that dynamically import
 * from this file. This avoids duplicating mock implementations across files
 * while keeping vi.mock() calls in test files where they get hoisted.
 *
 * Usage in test files:
 *   vi.mock("lucide-react", async () => (await import("./moyin-mock-defs")).lucideReact);
 */

// ── TanStack Router ──

export const tanstackRouter = {
	useParams: () => ({ project_id: "" }),
};

// ── Lucide React Icons ──

const icon = (name: string) => (props: Record<string, unknown>) => (
	<span data-testid={`icon-${name}`} {...props} />
);

export const lucideReact = {
	AlertTriangleIcon: icon("alert-triangle"),
	BookOpenIcon: icon("book-open"),
	ArrowLeftIcon: icon("arrow-left"),
	ArrowRightIcon: icon("arrow-right"),
	CameraIcon: icon("camera"),
	CheckCircle2Icon: icon("check-circle"),
	CheckIcon: icon("check"),
	ChevronDown: icon("chevron-down"),
	ChevronDownIcon: icon("chevron-down"),
	ChevronRightIcon: icon("chevron-right"),
	CircleIcon: icon("circle"),
	ClipboardCopyIcon: icon("clipboard-copy"),
	ClockIcon: icon("clock"),
	CopyIcon: icon("copy"),
	CrosshairIcon: icon("crosshair"),
	DownloadIcon: icon("download"),
	EyeIcon: icon("eye"),
	FileTextIcon: icon("file-text"),
	FilterIcon: icon("filter"),
	FilmIcon: icon("film"),
	GridIcon: icon("grid"),
	GripVerticalIcon: icon("grip-vertical"),
	ImageIcon: icon("image"),
	ListIcon: icon("list"),
	Loader2: icon("loader"),
	MapPinIcon: icon("map-pin"),
	MessageSquareIcon: icon("message-square"),
	MicIcon: icon("mic"),
	MonitorIcon: icon("monitor"),
	MoreHorizontalIcon: icon("more-horizontal"),
	MusicIcon: icon("music"),
	PencilIcon: icon("pencil"),
	PlusIcon: icon("plus"),
	RotateCcwIcon: icon("rotate"),
	SearchIcon: icon("search"),
	SmartphoneIcon: icon("smartphone"),
	SpeechIcon: icon("speech"),
	SparklesIcon: icon("sparkles"),
	SquareIcon: icon("square"),
	Trash2Icon: icon("trash"),
	UploadIcon: icon("upload"),
	UserIcon: icon("user"),
	UsersIcon: icon("users"),
	VideoIcon: icon("video"),
	Volume2Icon: icon("volume2"),
	XIcon: icon("x"),
	ZapIcon: icon("zap"),
	ArrowLeftRightIcon: icon("arrow-left-right"),
	ArrowUpFromLineIcon: icon("arrow-up-from-line"),
	BlendIcon: icon("blend"),
	BotIcon: icon("bot"),
	ClapperboardIcon: icon("clapperboard"),
	FolderOpenIcon: icon("folder-open"),
	FolderSync: icon("folder-sync"),
	Layers: icon("layers"),
	PaletteIcon: icon("palette"),
	ScissorsIcon: icon("scissors"),
	SquareTerminalIcon: icon("square-terminal"),
	StickerIcon: icon("sticker"),
	TextSelect: icon("text-select"),
	TypeIcon: icon("type"),
	VolumeXIcon: icon("volume-x"),
	Wand2Icon: icon("wand-2"),
	WandIcon: icon("wand"),
	WrenchIcon: icon("wrench"),
};

// ── UI Components ──

export const uiButton = {
	Button: ({
		children,
		onClick,
		disabled,
		...props
	}: {
		children: React.ReactNode;
		onClick?: () => void;
		disabled?: boolean;
		className?: string;
		variant?: string;
		size?: string;
	}) => (
		<button type="button" onClick={onClick} disabled={disabled} {...props}>
			{children}
		</button>
	),
};

export const uiTextarea = {
	Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
};

export const uiCard = {
	Card: ({
		children,
		...props
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<div data-testid="card" {...props}>
			{children}
		</div>
	),
	CardHeader: ({
		children,
		...props
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<div {...props}>{children}</div>
	),
	CardTitle: ({
		children,
		...props
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<div {...props}>{children}</div>
	),
	CardContent: ({
		children,
		...props
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<div {...props}>{children}</div>
	),
};

export const uiBadge = {
	Badge: ({
		children,
		...props
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<span {...props}>{children}</span>
	),
};

export const uiProgress = {
	Progress: ({ value }: { value: number }) => (
		<div data-testid="progress" role="progressbar" aria-valuenow={value} />
	),
};

export const uiInput = {
	Input: (props: Record<string, unknown>) => <input {...props} />,
};

export const uiCheckbox = {
	Checkbox: (props: Record<string, unknown>) => (
		<input type="checkbox" {...props} />
	),
};

export const uiLabel = {
	Label: ({
		children,
		...props
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<label {...props}>{children}</label>
	),
};

export const uiSelect = {
	Select: ({
		children,
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<div data-testid="select">{children}</div>
	),
	SelectTrigger: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SelectValue: ({ placeholder }: { placeholder?: string }) => (
		<span>{placeholder}</span>
	),
	SelectContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SelectItem: ({
		children,
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<div>{children}</div>
	),
	SelectGroup: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SelectLabel: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
};

export const uiDropdownMenu = {
	DropdownMenu: ({
		children,
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<div>{children}</div>
	),
	DropdownMenuTrigger: ({
		children,
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<div>{children}</div>
	),
	DropdownMenuContent: ({
		children,
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<div>{children}</div>
	),
	DropdownMenuItem: ({
		children,
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<div>{children}</div>
	),
	DropdownMenuSeparator: () => <div />,
};

export const uiDialog = {
	Dialog: ({
		children,
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<div>{children}</div>
	),
	DialogContent: ({
		children,
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DialogFooter: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
};

export const uiResizable = {
	ResizablePanelGroup: ({
		children,
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<div data-testid="resizable-panel-group">{children}</div>
	),
	ResizablePanel: ({
		children,
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<div data-testid="resizable-panel">{children}</div>
	),
	ResizableHandle: () => <div data-testid="resizable-handle" />,
};

// ── Moyin Modules ──

export const exampleScripts = {
	EXAMPLE_SCRIPTS: [
		{
			id: "test-example",
			label: "Test Example",
			language: "English",
			description: "Test script",
			content: "Test content",
			structure: {
				scriptData: {
					title: "Test",
					language: "English",
					characters: [],
					scenes: [],
					episodes: [],
					storyParagraphs: [],
				},
				characters: [],
				scenes: [],
				episodes: [],
				shots: [],
			},
		},
	],
};

export const visualStyles = {
	VISUAL_STYLE_PRESETS: [
		{
			id: "2d_ghibli",
			name: "Ghibli",
			category: "2d",
			mediaType: "animation",
			prompt: "ghibli style",
			negativePrompt: "",
			description: "Test style",
		},
	],
};

export const cinematographyProfiles = {
	CINEMATOGRAPHY_PROFILES: [
		{
			id: "classic-cinematic",
			name: "Classic",
			emoji: "\uD83C\uDFAC",
			referenceFilms: ["Test Film"],
		},
	],
};

export const utils = {
	cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
};

export const batchProgress = {
	BatchGenerateButtons: ({
		disabled,
	}: {
		onStart: () => void;
		disabled: boolean;
	}) => <div data-testid="batch-buttons" data-disabled={disabled} />,
	BatchProgressOverlay: () => <div data-testid="batch-overlay" />,
	useBatchGeneration: () => ({
		batch: null,
		startBatch: () => {},
		cancel: () => {},
	}),
};
