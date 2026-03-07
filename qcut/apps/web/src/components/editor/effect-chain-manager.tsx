import React, { useState } from "react";
import { useEffectsStore } from "@/stores/ai/effects-store";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
// DnD functionality temporarily removed - can be added with proper library installation
import { Layers, Plus, Trash2, Move, Eye, EyeOff } from "lucide-react";
import type { EffectInstance } from "@/types/effects";

interface EffectChainManagerProps {
	elementId: string;
}

export function EffectChainManager({ elementId }: EffectChainManagerProps) {
	const {
		activeEffects,
		effectChains,
		presets,
		getElementEffects,
		createChain,
		removeChain,
		updateChainBlendMode,
		toggleEffectInChain,
		moveEffectInChain,
		toggleEffect,
		removeEffect,
	} = useEffectsStore();

	const [isCreatingChain, setIsCreatingChain] = useState(false);
	const [chainName, setChainName] = useState("");
	const [selectedEffects, setSelectedEffects] = useState<string[]>([]);

	const effects = getElementEffects(elementId);
	const chains = effectChains.get(elementId) || [];

	const handleCreateChain = () => {
		if (chainName && selectedEffects.length > 0) {
			createChain(elementId, chainName, selectedEffects);
			setChainName("");
			setSelectedEffects([]);
			setIsCreatingChain(false);
		}
	};

	const handleMoveEffect = (effectId: string, direction: "up" | "down") => {
		const effectIndex = effects.findIndex((e) => e.id === effectId);
		if (effectIndex === -1) return;

		const newIndex = direction === "up" ? effectIndex - 1 : effectIndex + 1;
		if (newIndex >= 0 && newIndex < effects.length) {
			moveEffectInChain(elementId, effectId, newIndex);
		}
	};

	return (
		<div className="space-y-4">
			{/* Effect Chain Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Layers className="h-5 w-5" aria-hidden="true" />
					<h3 className="font-semibold">Effect Chains</h3>
				</div>
				<Button
					size="sm"
					variant="outline"
					onClick={() => setIsCreatingChain(!isCreatingChain)}
				>
					<Plus className="h-4 w-4 mr-1" />
					New Chain
				</Button>
			</div>

			{/* Create Chain Form */}
			{isCreatingChain && (
				<Card className="p-4">
					<div className="space-y-3">
						<label
							htmlFor="chainName"
							className="block text-sm font-medium mb-1"
						>
							Chain name
						</label>
						<input
							type="text"
							id="chainName"
							placeholder="e.g., Cinematic Warm Overlay"
							value={chainName}
							onChange={(e) => setChainName(e.target.value)}
							className="w-full px-3 py-2 border rounded"
						/>

						<div className="space-y-2">
							<p className="text-sm text-muted-foreground">Select effects:</p>
							<div className="grid grid-cols-2 gap-2">
								{presets.slice(0, 8).map((preset) => (
									<label
										key={preset.id}
										className="flex items-center space-x-2"
									>
										<input
											type="checkbox"
											checked={selectedEffects.includes(preset.id)}
											onChange={(e) => {
												if (e.target.checked) {
													setSelectedEffects([...selectedEffects, preset.id]);
												} else {
													setSelectedEffects(
														selectedEffects.filter((id) => id !== preset.id)
													);
												}
											}}
										/>
										<span className="text-sm">{preset.name}</span>
									</label>
								))}
							</div>
						</div>

						<div className="flex gap-2">
							<Button
								type="button"
								size="sm"
								onClick={handleCreateChain}
								disabled={!chainName || selectedEffects.length === 0}
							>
								Create
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => {
									setIsCreatingChain(false);
									setChainName("");
									setSelectedEffects([]);
								}}
							>
								Cancel
							</Button>
						</div>
					</div>
				</Card>
			)}

			{/* Existing Chains */}
			{chains.length > 0 && (
				<div className="space-y-2">
					<h4 className="text-sm font-medium">Active Chains</h4>
					{chains.map((chain) => (
						<Card key={chain.id} className="p-3">
							<div className="flex items-center justify-between mb-2">
								<span className="font-medium">{chain.name}</span>
								<div className="flex items-center gap-2">
									<Select
										value={chain.blendMode || "normal"}
										onValueChange={(value) =>
											updateChainBlendMode(
												elementId,
												chain.id,
												value as "normal" | "overlay" | "multiply" | "screen"
											)
										}
									>
										<SelectTrigger
											className="w-[140px]"
											aria-label="Blend mode"
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="normal">Normal</SelectItem>
											<SelectItem value="overlay">Overlay</SelectItem>
											<SelectItem value="multiply">Multiply</SelectItem>
											<SelectItem value="screen">Screen</SelectItem>
										</SelectContent>
									</Select>
									<Button
										type="button"
										size="icon"
										variant="text"
										onClick={() => removeChain(elementId, chain.id)}
										aria-label={`Remove ${chain.name} chain`}
									>
										<Trash2 className="h-4 w-4" aria-hidden="true" />
									</Button>
								</div>
							</div>

							<div className="space-y-1">
								{chain.effects.map((effect, index) => (
									<div
										key={effect.id}
										className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded"
									>
										<span>
											{index + 1}. {effect.name}
										</span>
										<Button
											type="button"
											size="icon"
											variant="text"
											aria-label={
												effect.enabled ? "Disable effect" : "Enable effect"
											}
											onClick={() =>
												toggleEffectInChain(elementId, chain.id, effect.id)
											}
										>
											{effect.enabled ? (
												<Eye className="h-3 w-3" aria-hidden="true" />
											) : (
												<EyeOff className="h-3 w-3" aria-hidden="true" />
											)}
										</Button>
									</div>
								))}
							</div>
						</Card>
					))}
				</div>
			)}

			{/* Individual Effects */}
			{effects.length > 0 && (
				<div className="space-y-2">
					<h4 className="text-sm font-medium">Individual Effects</h4>
					<div className="space-y-2">
						{effects.map((effect, index) => (
							<div
								key={effect.id}
								className="flex items-center justify-between p-3 bg-card border rounded-lg"
							>
								<div className="flex items-center gap-2">
									<div className="flex flex-col gap-1">
										<Button
											type="button"
											size="icon"
											variant="text"
											disabled={index === 0}
											onClick={() => handleMoveEffect(effect.id, "up")}
											aria-label={`Move ${effect.name} up`}
										>
											<Move className="h-3 w-3 rotate-180" aria-hidden="true" />
										</Button>
										<Button
											type="button"
											size="icon"
											variant="text"
											disabled={index === effects.length - 1}
											onClick={() => handleMoveEffect(effect.id, "down")}
											aria-label={`Move ${effect.name} down`}
										>
											<Move className="h-3 w-3" aria-hidden="true" />
										</Button>
									</div>
									<span className="font-medium">
										{index + 1}. {effect.name}
									</span>
								</div>

								<div className="flex items-center gap-1">
									<Button
										type="button"
										size="icon"
										variant="text"
										aria-label={
											effect.enabled ? "Disable effect" : "Enable effect"
										}
										onClick={() => toggleEffect(elementId, effect.id)}
									>
										{effect.enabled ? (
											<Eye className="h-4 w-4" aria-hidden="true" />
										) : (
											<EyeOff className="h-4 w-4" aria-hidden="true" />
										)}
									</Button>
									<Button
										type="button"
										size="icon"
										variant="text"
										aria-label="Remove effect"
										onClick={() => removeEffect(elementId, effect.id)}
									>
										<Trash2 className="h-4 w-4" aria-hidden="true" />
									</Button>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
