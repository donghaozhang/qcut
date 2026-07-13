import { Check, Eye, EyeOff, Save, Trash2 } from "lucide-react";
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
import type { SavedColorPreset } from "@/lib/color/color-presets";

export function ColorPresetControls({
	presets,
	selectedPresetId,
	bypassed,
	onSelectedPresetChange,
	onApplyPreset,
	onDeletePreset,
	onSavePreset,
	onBypassedChange,
}: {
	presets: SavedColorPreset[];
	selectedPresetId: string | undefined;
	bypassed: boolean;
	onSelectedPresetChange: (id: string) => void;
	onApplyPreset: () => void;
	onDeletePreset: () => void;
	onSavePreset: (name?: string) => void;
	onBypassedChange: (bypassed: boolean) => void;
}) {
	const [name, setName] = useState("");
	return (
		<div className="space-y-2 border-b border-border/70 pb-3">
			<div className="flex items-center gap-1">
				<Select
					value={selectedPresetId ?? ""}
					onValueChange={onSelectedPresetChange}
				>
					<SelectTrigger
						className="h-8 min-w-0 flex-1"
						aria-label="已保存的调色预设"
					>
						<SelectValue placeholder="已保存预设" />
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
					aria-label="应用调色预设"
					title="应用调色预设"
					disabled={!selectedPresetId}
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
					aria-label="删除调色预设"
					title="删除调色预设"
					disabled={!selectedPresetId}
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
					placeholder="预设名称"
					aria-label="调色预设名称"
					className="h-8 min-w-0 flex-1 text-xs"
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8"
					aria-label="保存调色预设"
					title="保存调色预设"
					onClick={() => {
						onSavePreset(name);
						setName("");
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.currentTarget.click();
						}
					}}
				>
					<Save className="size-3.5" />
				</Button>
				<Button
					type="button"
					variant={bypassed ? "secondary" : "outline"}
					size="sm"
					className="h-8 gap-1 px-2 text-[10px]"
					aria-label={bypassed ? "显示调色预览" : "显示原始画面"}
					title={bypassed ? "显示调色预览" : "显示原始画面"}
					onClick={() => onBypassedChange(!bypassed)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.currentTarget.click();
						}
					}}
				>
					{bypassed ? (
						<Eye className="size-3.5" />
					) : (
						<EyeOff className="size-3.5" />
					)}
					{bypassed ? "调色后" : "原始"}
				</Button>
			</div>
		</div>
	);
}
