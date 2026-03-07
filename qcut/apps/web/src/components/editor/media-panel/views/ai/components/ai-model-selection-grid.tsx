import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AI_MODELS } from "../constants/ai-constants";
import {
	getProviderLogo,
	getProviderName,
} from "../constants/model-provider-logos";
import type { AIActiveTab } from "../types/ai-types";

interface AIModelSelectionGridProps {
	activeTab: AIActiveTab;
	selectedModels: string[];
	isCompact: boolean;
	onToggleModel: (modelId: string) => void;
}

export function AIModelSelectionGrid({
	activeTab,
	selectedModels,
	isCompact,
	onToggleModel,
}: AIModelSelectionGridProps) {
	const isModelSelected = (modelId: string) => selectedModels.includes(modelId);

	return (
		<div className="space-y-2">
			<Label className="text-xs font-medium">Select AI Models</Label>
			<div className="grid grid-cols-2 gap-2">
				{AI_MODELS.filter((model) => {
					if (activeTab === "avatar") {
						return model.category === "avatar";
					}
					if (activeTab === "text") {
						return (
							model.category === "text" ||
							(!model.category && model.category !== "avatar")
						);
					}
					if (activeTab === "image") {
						return model.category === "image";
					}
					if (activeTab === "upscale") {
						return model.category === "upscale";
					}
					if (activeTab === "angles") {
						return model.category === "angles";
					}
					return false;
				}).map((model) => (
					<Button
						key={model.id}
						type="button"
						size="sm"
						variant={isModelSelected(model.id) ? "default" : "outline"}
						onClick={() => onToggleModel(model.id)}
						className={`h-auto min-h-[44px] py-2 px-2 text-xs justify-start items-start ${isCompact ? "flex-col" : "flex-row"}`}
					>
						<div className="flex items-center gap-1.5 text-left leading-tight flex-1 min-w-0">
							{(() => {
								const logo = getProviderLogo(model.id);
								return logo ? (
									<img
										src={logo}
										alt={`${getProviderName(model.id) ?? model.name} logo`}
										loading="lazy"
										className="w-5 h-5 shrink-0 rounded-sm"
									/>
								) : null;
							})()}
							<div className="flex flex-col min-w-0">
								<span className="truncate">{model.name}</span>
								{model.badge && (
									<span className="text-[10px] text-muted-foreground/80 truncate">
										{model.badge}
									</span>
								)}
							</div>
						</div>
						{!isCompact && (
							<span className="ml-2 text-muted-foreground whitespace-nowrap shrink-0">
								${model.price}
							</span>
						)}
					</Button>
				))}
			</div>
		</div>
	);
}
