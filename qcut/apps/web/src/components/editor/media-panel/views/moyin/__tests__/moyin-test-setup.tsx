/**
 * Shared mock setup for all moyin test files.
 *
 * Import this file as a side-effect BEFORE importing any moyin components:
 *   import "./moyin-test-setup";
 *
 * vi.mock() calls execute at module-evaluation time and register mocks
 * in Vitest's module registry before component imports resolve.
 */
import { vi } from "vitest";
import { useMoyinStore } from "@/stores/moyin/moyin-store";

// Mock TanStack Router — return empty project_id to prevent loadProject from resetting state
vi.mock("@tanstack/react-router", () => ({
	useParams: () => ({ project_id: "" }),
}));

// Mock lucide-react icons as simple spans
vi.mock("lucide-react", () => {
	const icon = (name: string) => (props: Record<string, unknown>) => (
		<span data-testid={`icon-${name}`} {...props} />
	);
	return {
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
		// Media panel store tab icons (transitive import via moyin-parse-actions)
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
});

// Mock UI components
vi.mock("@/components/ui/button", () => ({
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
}));

vi.mock("@/components/ui/textarea", () => ({
	Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
}));

vi.mock("@/components/ui/card", () => ({
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
}));

vi.mock("@/components/ui/badge", () => ({
	Badge: ({
		children,
		...props
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<span {...props}>{children}</span>
	),
}));

vi.mock("@/components/ui/progress", () => ({
	Progress: ({ value }: { value: number }) => (
		<div data-testid="progress" role="progressbar" aria-valuenow={value} />
	),
}));

vi.mock("@/components/ui/input", () => ({
	Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("@/components/ui/checkbox", () => ({
	Checkbox: (props: Record<string, unknown>) => (
		<input type="checkbox" {...props} />
	),
}));

vi.mock("@/components/ui/label", () => ({
	Label: ({
		children,
		...props
	}: { children: React.ReactNode } & Record<string, unknown>) => (
		<label {...props}>{children}</label>
	),
}));

vi.mock("@/components/ui/select", () => ({
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
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
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
}));

vi.mock("@/components/ui/dialog", () => ({
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
}));

vi.mock("@/components/ui/resizable", () => ({
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
}));

vi.mock("@/lib/moyin/script/example-scripts", () => ({
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
}));

vi.mock("@/lib/moyin/presets/visual-styles", () => ({
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
}));

vi.mock("@/lib/moyin/presets/cinematography-profiles", () => ({
	CINEMATOGRAPHY_PROFILES: [
		{
			id: "classic-cinematic",
			name: "Classic",
			emoji: "\uD83C\uDFAC",
			referenceFilms: ["Test Film"],
		},
	],
}));

vi.mock("@/lib/utils", () => ({
	cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("../batch-progress", () => ({
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
}));

// ============================================================
// Helper to reset Zustand store between tests
// ============================================================
export function resetStore() {
	useMoyinStore.getState().reset();
}

export { useMoyinStore };
