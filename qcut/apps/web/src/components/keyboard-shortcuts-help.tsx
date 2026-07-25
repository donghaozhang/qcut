"use client";

import { Download, Keyboard, RotateCcw, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Action } from "@/constants/actions";
import {
	cloneProfileKeybindings,
	DEFAULT_KEYBINDING_PROFILE_ID,
	KEYBINDING_PROFILES,
	type KeybindingProfileId,
} from "@/constants/keybinding-profiles";
import {
	SHORTCUT_CATEGORIES,
	SHORTCUT_CATEGORY_LABELS,
	type ShortcutCategory,
} from "@/constants/shortcut-commands";
import { useKeyboardShortcutsHelp } from "@/hooks/keyboard/use-keyboard-shortcuts-help";
import { useTranslation } from "@/lib/i18n";
import {
	parseKeybindingExport,
	serializeKeybindingExport,
} from "@/lib/keybindings/keybinding-transfer";
import {
	type ActiveKeybindingProfileId,
	useKeybindingsStore,
} from "@/stores/editor/keybindings-store";
import type { KeybindingConfig, ShortcutKey } from "@/types/keybinding";
import { KeyboardShortcutRow } from "./keyboard-shortcut-row";
import { Button } from "./ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "./ui/dialog";
import { DropdownMenuItem } from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { Switch } from "./ui/switch";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

function removeActionBindings({
	keybindings,
	action,
}: {
	keybindings: KeybindingConfig;
	action: Action;
}): KeybindingConfig {
	return Object.fromEntries(
		Object.entries(keybindings).filter(([, candidate]) => candidate !== action)
	) as KeybindingConfig;
}

function downloadKeybindings({
	keybindings,
	profileId,
}: {
	keybindings: KeybindingConfig;
	profileId: ActiveKeybindingProfileId;
}) {
	const blob = new Blob(
		[serializeKeybindingExport({ keybindings, profileId })],
		{ type: "application/json" }
	);
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = "qcut-shortcuts.json";
	anchor.click();
	URL.revokeObjectURL(url);
}

export const KeyboardShortcutsHelp = ({
	variant,
}: {
	variant?: "menu-item";
} = {}) => {
	const { t } = useTranslation();
	const storedKeybindings = useKeybindingsStore((state) => state.keybindings);
	const storedProfileId = useKeybindingsStore((state) => state.activeProfileId);
	const replaceKeybindings = useKeybindingsStore(
		(state) => state.replaceKeybindings
	);
	const getKeybindingString = useKeybindingsStore(
		(state) => state.getKeybindingString
	);
	const setIsRecording = useKeybindingsStore((state) => state.setIsRecording);
	const [open, setOpen] = useState(false);
	const [draftKeybindings, setDraftKeybindings] =
		useState<KeybindingConfig>(storedKeybindings);
	const [draftProfileId, setDraftProfileId] =
		useState<ActiveKeybindingProfileId>(storedProfileId);
	const [recordingAction, setRecordingAction] = useState<Action | null>(null);
	const [category, setCategory] = useState<ShortcutCategory>("timeline");
	const [query, setQuery] = useState("");
	const [unboundOnly, setUnboundOnly] = useState(false);
	const importInputRef = useRef<HTMLInputElement>(null);
	const { shortcuts } = useKeyboardShortcutsHelp({
		keybindings: draftKeybindings,
	});

	useEffect(() => {
		if (!open) return;
		setDraftKeybindings({ ...storedKeybindings });
		setDraftProfileId(storedProfileId);
		setRecordingAction(null);
		setIsRecording(false);
	}, [open, setIsRecording, storedKeybindings, storedProfileId]);

	useEffect(() => {
		setIsRecording(recordingAction !== null);
		if (!recordingAction) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();
			if (event.key === "Escape") {
				setRecordingAction(null);
				return;
			}
			const key = getKeybindingString(event);
			if (!key) return;
			const conflict = draftKeybindings[key];
			if (conflict && conflict !== recordingAction) {
				toast.error(
					t("shortcuts.conflict", {
						key,
						action: String(conflict).replaceAll("-", " "),
					})
				);
				return;
			}
			setDraftKeybindings((current) => ({
				...removeActionBindings({
					keybindings: current,
					action: recordingAction,
				}),
				[key]: recordingAction,
			}));
			setDraftProfileId("custom");
			setRecordingAction(null);
		};
		document.addEventListener("keydown", handleKeyDown, true);
		return () => document.removeEventListener("keydown", handleKeyDown, true);
	}, [
		draftKeybindings,
		getKeybindingString,
		recordingAction,
		setIsRecording,
		t,
	]);

	useEffect(
		() => () => {
			setIsRecording(false);
		},
		[setIsRecording]
	);

	const filteredShortcuts = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		return shortcuts.filter(
			(shortcut) =>
				shortcut.category === category &&
				(!unboundOnly || shortcut.keys.length === 0) &&
				(!normalizedQuery ||
					shortcut.description.toLocaleLowerCase().includes(normalizedQuery) ||
					shortcut.action.includes(normalizedQuery))
		);
	}, [category, query, shortcuts, unboundOnly]);

	const applyDraftProfile = (profileId: KeybindingProfileId) => {
		setDraftKeybindings(cloneProfileKeybindings({ id: profileId }));
		setDraftProfileId(profileId);
		setRecordingAction(null);
	};

	const clearAction = (action: Action) => {
		setDraftKeybindings((current) =>
			removeActionBindings({ keybindings: current, action })
		);
		setDraftProfileId("custom");
	};

	const save = () => {
		replaceKeybindings({
			keybindings: draftKeybindings,
			profileId: draftProfileId,
		});
		setOpen(false);
	};

	const importFile = async (file: File) => {
		try {
			const imported = parseKeybindingExport({ text: await file.text() });
			setDraftKeybindings(imported.keybindings);
			setDraftProfileId(imported.profileId);
		} catch {
			toast.error(t("shortcuts.importError"));
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen) setRecordingAction(null);
			}}
		>
			<DialogTrigger asChild>
				{variant === "menu-item" ? (
					<DropdownMenuItem
						className="flex items-center gap-1.5"
						onSelect={(event) => event.preventDefault()}
					>
						<Keyboard className="size-4" />
						{t("shortcuts.menu")}
					</DropdownMenuItem>
				) : (
					<Button type="button" variant="text" size="sm" className="gap-2">
						<Keyboard className="size-4" />
						{t("shortcuts.menu")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent
				className="flex h-[min(760px,88vh)] max-w-3xl flex-col overflow-hidden p-0"
				data-testid="keyboard-shortcuts-dialog"
			>
				<DialogHeader className="border-b px-5 pb-4 pt-5">
					<div className="flex items-center justify-between gap-4 pr-8">
						<DialogTitle className="flex items-center gap-2">
							<Keyboard className="size-5" />
							{t("shortcuts.title")}
						</DialogTitle>
						<Select
							value={draftProfileId}
							onValueChange={(value) => {
								if (value !== "custom") {
									applyDraftProfile(value as KeybindingProfileId);
								}
							}}
						>
							<SelectTrigger
								className="h-8 w-48"
								aria-label={t("shortcuts.profile")}
								data-testid="shortcut-profile-select"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{draftProfileId === "custom" ? (
									<SelectItem value="custom">
										{t("shortcuts.customProfile")}
									</SelectItem>
								) : null}
								{KEYBINDING_PROFILES.map((profile) => (
									<SelectItem key={profile.id} value={profile.id}>
										{profile.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</DialogHeader>

				<div className="flex items-center gap-3 border-b px-5 py-3">
					<div className="relative min-w-0 flex-1">
						<Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={t("shortcuts.search")}
							aria-label={t("shortcuts.search")}
							className="h-8 pl-8"
						/>
					</div>
					<label className="flex shrink-0 items-center gap-2 text-xs">
						{t("shortcuts.unboundOnly")}
						<Switch
							checked={unboundOnly}
							onCheckedChange={setUnboundOnly}
							aria-label={t("shortcuts.unboundOnly")}
						/>
					</label>
				</div>

				<Tabs
					value={category}
					onValueChange={(value) => setCategory(value as ShortcutCategory)}
					className="flex min-h-0 flex-1 flex-col px-5 pt-3"
				>
					<TabsList className="grid w-full grid-cols-4 rounded-sm">
						{SHORTCUT_CATEGORIES.map((categoryId) => (
							<TabsTrigger key={categoryId} value={categoryId}>
								{t(SHORTCUT_CATEGORY_LABELS[categoryId])}
							</TabsTrigger>
						))}
					</TabsList>
					<div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
						{filteredShortcuts.map((shortcut) => (
							<KeyboardShortcutRow
								key={shortcut.action}
								shortcut={shortcut}
								isRecording={recordingAction === shortcut.action}
								unboundLabel={t("shortcuts.unbound")}
								recordingLabel={t("shortcuts.recording")}
								onRecord={() => setRecordingAction(shortcut.action)}
								onClear={() => clearAction(shortcut.action)}
							/>
						))}
					</div>
				</Tabs>

				<DialogFooter className="flex-row items-center justify-between border-t px-5 py-3 sm:justify-between">
					<div className="flex items-center gap-1">
						<Button
							type="button"
							variant="text"
							size="sm"
							onClick={() => applyDraftProfile(DEFAULT_KEYBINDING_PROFILE_ID)}
						>
							<RotateCcw className="size-4" />
							{t("shortcuts.reset")}
						</Button>
						<Button
							type="button"
							variant="text"
							size="sm"
							onClick={() => importInputRef.current?.click()}
						>
							<Upload className="size-4" />
							{t("shortcuts.import")}
						</Button>
						<Button
							type="button"
							variant="text"
							size="sm"
							onClick={() =>
								downloadKeybindings({
									keybindings: draftKeybindings,
									profileId: draftProfileId,
								})
							}
						>
							<Download className="size-4" />
							{t("shortcuts.export")}
						</Button>
						<input
							ref={importInputRef}
							type="file"
							accept="application/json,.json"
							className="hidden"
							onChange={(event) => {
								const file = event.target.files?.[0];
								if (file) void importFile(file);
								event.target.value = "";
							}}
						/>
					</div>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
						>
							{t("shortcuts.cancel")}
						</Button>
						<Button type="button" onClick={save} data-testid="shortcut-save">
							{t("shortcuts.save")}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
