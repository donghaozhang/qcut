import { Check, Save, Trash2 } from "lucide-react";
import { useState } from "react";
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
}) {
	const [name, setName] = useState("");
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
								{preset.name}
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
						if (event.key === "Enter" || event.key === " ") {
							event.currentTarget.click();
						}
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
						if (event.key === "Enter" || event.key === " ") {
							event.currentTarget.click();
						}
					}}
				>
					<Trash2 className="size-3.5" />
				</Button>
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
						if (event.key === "Enter" || event.key === " ") {
							event.currentTarget.click();
						}
					}}
				>
					<Save className="size-3.5" />
				</Button>
			</div>
		</div>
	);
}
