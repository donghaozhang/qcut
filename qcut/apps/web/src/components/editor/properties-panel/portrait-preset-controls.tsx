import {
	Check,
	Download,
	Pencil,
	RefreshCw,
	Save,
	Trash2,
	Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type {
	PortraitPresetScope,
	SavedPortraitPreset,
} from "@/lib/portrait/portrait-presets";

export function PortraitPresetControls({
	scope,
	presets,
	selectedPresetId,
	disabled,
	locale,
	onSelectedPresetChange,
	onApplyPreset,
	onDeletePreset,
	onSavePreset,
	onRenamePreset,
	onOverwritePreset,
	onExportPresets,
	onImportPresets,
}: {
	scope: PortraitPresetScope;
	presets: SavedPortraitPreset[];
	selectedPresetId: string | undefined;
	disabled: boolean;
	locale: string;
	onSelectedPresetChange: (id: string) => void;
	onApplyPreset: () => void;
	onDeletePreset: () => void;
	onSavePreset: (name?: string) => void;
	onRenamePreset: (name: string) => void;
	onOverwritePreset: () => void;
	onExportPresets: () => void;
	onImportPresets: (file: File) => void;
}) {
	const [name, setName] = useState("");
	const [renaming, setRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState("");
	const importInputRef = useRef<HTMLInputElement>(null);
	const selected = presets.find((preset) => preset.id === selectedPresetId);
	const commitRename = () => {
		onRenamePreset(renameValue);
		setRenaming(false);
	};
	const isZh = locale === "zh";
	const scopeName = isZh
		? scope === "face"
			? "美颜"
			: "美体"
		: scope === "face"
			? "Retouch"
			: "Body";
	const save = () => {
		onSavePreset(name);
		setName("");
	};

	return (
		<div
			className="space-y-2 border-b border-border/70 pb-3"
			data-testid={`portrait-${scope}-preset-controls`}
		>
			<div className="flex items-center gap-1">
				<Select
					value={selectedPresetId ?? ""}
					onValueChange={onSelectedPresetChange}
					disabled={disabled || presets.length === 0}
				>
					<SelectTrigger
						className="h-8 min-w-0 flex-1"
						aria-label={`${scopeName}${isZh ? "预设" : " presets"}`}
					>
						<SelectValue
							placeholder={isZh ? `${scopeName}预设` : `${scopeName} presets`}
						/>
					</SelectTrigger>
					<SelectContent>
						{presets.map((preset) => (
							<SelectItem key={preset.id} value={preset.id}>
								<span className="flex items-center gap-2">
									{preset.thumbnailDataUrl ? (
										<img
											src={preset.thumbnailDataUrl}
											alt=""
											className="size-6 shrink-0 rounded-sm object-cover"
										/>
									) : null}
									{preset.name}
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8"
					aria-label={
						isZh ? `应用${scopeName}预设` : `Apply ${scopeName} preset`
					}
					title={isZh ? `应用${scopeName}预设` : `Apply ${scopeName} preset`}
					disabled={disabled || !selectedPresetId}
					onClick={onApplyPreset}
					onKeyDown={(event) => {
						// Native buttons already click on Enter; only Space needs
						// help, and preventDefault stops the native double-fire.
						if (event.key !== " ") return;
						event.preventDefault();
						event.currentTarget.click();
					}}
				>
					<Check className="size-3.5" />
				</Button>
				<Button
					type="button"
					variant="text"
					size="icon"
					className="size-8"
					aria-label={
						isZh ? `删除${scopeName}预设` : `Delete ${scopeName} preset`
					}
					title={isZh ? `删除${scopeName}预设` : `Delete ${scopeName} preset`}
					disabled={disabled || !selectedPresetId}
					onClick={onDeletePreset}
					onKeyDown={(event) => {
						// Native buttons already click on Enter; only Space needs
						// help, and preventDefault stops the native double-fire.
						if (event.key !== " ") return;
						event.preventDefault();
						event.currentTarget.click();
					}}
				>
					<Trash2 className="size-3.5" />
				</Button>
			</div>
			{renaming ? (
				<div className="flex items-center gap-1">
					<Input
						value={renameValue}
						onChange={(event) => setRenameValue(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") commitRename();
							if (event.key === "Escape") setRenaming(false);
						}}
						aria-label={isZh ? "重命名预设" : "Rename preset"}
						className="h-8 min-w-0 flex-1 text-xs"
						ref={(node) => node?.focus()}
					/>
					<Button
						type="button"
						variant="outline"
						size="icon"
						className="size-8"
						aria-label={isZh ? "确认重命名" : "Confirm rename"}
						onClick={commitRename}
					>
						<Check className="size-3.5" />
					</Button>
				</div>
			) : (
				<div className="flex items-center gap-1">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 min-w-0 flex-1 gap-1 px-2 text-xs"
						aria-label={isZh ? "重命名预设" : "Rename preset"}
						title={isZh ? "重命名预设" : "Rename preset"}
						disabled={disabled || !selected}
						onClick={() => {
							setRenameValue(selected?.name ?? "");
							setRenaming(true);
						}}
					>
						<Pencil className="size-3.5" />
						{isZh ? "重命名" : "Rename"}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 min-w-0 flex-1 gap-1 px-2 text-xs"
						aria-label={isZh ? "覆盖保存预设" : "Overwrite preset"}
						title={
							isZh ? "用当前参数覆盖所选预设" : "Overwrite with current values"
						}
						disabled={disabled || !selected}
						onClick={onOverwritePreset}
					>
						<RefreshCw className="size-3.5" />
						{isZh ? "覆盖" : "Update"}
					</Button>
				</div>
			)}
			<div className="flex items-center gap-1">
				<Button
					type="button"
					variant="text"
					size="sm"
					className="h-8 min-w-0 flex-1 gap-1 px-2 text-xs"
					aria-label={isZh ? "导出预设" : "Export presets"}
					title={isZh ? "导出预设" : "Export presets"}
					disabled={disabled}
					onClick={onExportPresets}
				>
					<Download className="size-3.5" />
					{isZh ? "导出" : "Export"}
				</Button>
				<Button
					type="button"
					variant="text"
					size="sm"
					className="h-8 min-w-0 flex-1 gap-1 px-2 text-xs"
					aria-label={isZh ? "导入预设" : "Import presets"}
					title={isZh ? "导入预设" : "Import presets"}
					disabled={disabled}
					onClick={() => importInputRef.current?.click()}
				>
					<Upload className="size-3.5" />
					{isZh ? "导入" : "Import"}
				</Button>
				<input
					ref={importInputRef}
					type="file"
					accept="application/json,.json"
					className="hidden"
					onChange={(event) => {
						const file = event.target.files?.[0];
						// Reset first so picking the same file twice still fires.
						event.target.value = "";
						if (file) onImportPresets(file);
					}}
				/>
			</div>
			<div className="flex items-center gap-1">
				<Input
					value={name}
					onChange={(event) => setName(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") save();
					}}
					placeholder={isZh ? "预设名称" : "Preset name"}
					aria-label={
						isZh ? `${scopeName}预设名称` : `${scopeName} preset name`
					}
					className="h-8 min-w-0 flex-1 text-xs"
					disabled={disabled}
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8"
					aria-label={
						isZh ? `保存${scopeName}预设` : `Save ${scopeName} preset`
					}
					title={isZh ? `保存${scopeName}预设` : `Save ${scopeName} preset`}
					disabled={disabled}
					onClick={save}
					onKeyDown={(event) => {
						// Native buttons already click on Enter; only Space needs
						// help, and preventDefault stops the native double-fire.
						if (event.key !== " ") return;
						event.preventDefault();
						event.currentTarget.click();
					}}
				>
					<Save className="size-3.5" />
				</Button>
			</div>
		</div>
	);
}
