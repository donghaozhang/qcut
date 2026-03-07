"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAdjustmentStore } from "@/stores/ai/adjustment-store";
import {
	getImageEditModels,
	getModelCapabilities,
	type ImageEditModelId,
} from "@/lib/ai-clients/image-edit-client";
import { cn } from "@/lib/utils";
import { Check, Images } from "lucide-react";
import { getProviderLogo } from "../media-panel/views/ai/constants/model-provider-logos";

export function ModelSelector() {
	const { selectedModel, setSelectedModel } = useAdjustmentStore();
	const models = getImageEditModels();

	return (
		<Card>
			<CardContent className="p-3 space-y-3">
				<div className="flex items-center gap-2">
					<div className="w-1.5 h-1.5 bg-primary rounded-full" />
					<label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Model Selection
					</label>
				</div>
				<div
					className="space-y-1.5 max-h-48 overflow-y-auto pr-1"
					style={{ scrollbarWidth: "thin" }}
				>
					{models.map((model) => {
						const isSelected = selectedModel === model.id;

						return (
							<button
								type="button"
								key={model.id}
								className={cn(
									"w-full h-6 px-2 rounded-md border text-left cursor-pointer transition-all duration-200 flex items-center justify-between",
									isSelected
										? "bg-transparent text-[var(--brand)] border-[var(--brand)] shadow-sm"
										: "bg-card hover:bg-muted/50 border-muted-foreground/20 hover:border-muted-foreground/40"
								)}
								onClick={() => setSelectedModel(model.id as ImageEditModelId)}
							>
								<div className="flex items-center gap-1.5 min-w-0">
									{isSelected && <Check className="w-3 h-3 flex-shrink-0" />}
									{(() => {
										const logo = getProviderLogo(model.id);
										return logo ? (
											<img
												src={logo}
												alt=""
												className="w-4 h-4 shrink-0 rounded-sm"
											/>
										) : null;
									})()}
									<span className="text-xs font-medium truncate">
										{model.name}
									</span>
									{(() => {
										const caps = getModelCapabilities(model.id);
										if (caps.supportsMultiple) {
											return (
												<span
													className="flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground"
													title={`Supports up to ${caps.maxImages} images`}
												>
													<Images className="w-2.5 h-2.5" />
													{caps.maxImages}
												</span>
											);
										}
										return null;
									})()}
								</div>
								<span
									className={cn(
										"text-[10px] font-medium ml-2 flex-shrink-0 border border-transparent",
										isSelected ? "text-[var(--brand)]/80" : "text-muted-foreground"
									)}
								>
									{model.estimatedCost}
								</span>
							</button>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
