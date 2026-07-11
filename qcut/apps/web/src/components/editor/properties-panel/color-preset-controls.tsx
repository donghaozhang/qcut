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
						aria-label="Saved color preset"
					>
						<SelectValue placeholder="Saved presets" />
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
					aria-label="Apply color preset"
					title="Apply color preset"
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
					aria-label="Delete color preset"
					title="Delete color preset"
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
					placeholder="Preset name"
					aria-label="Color preset name"
					className="h-8 min-w-0 flex-1 text-xs"
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8"
					aria-label="Save color preset"
					title="Save color preset"
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
					aria-label={
						bypassed ? "Show graded preview" : "Show original preview"
					}
					title={bypassed ? "Show graded preview" : "Show original preview"}
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
					{bypassed ? "Graded" : "Original"}
				</Button>
			</div>
		</div>
	);
}
