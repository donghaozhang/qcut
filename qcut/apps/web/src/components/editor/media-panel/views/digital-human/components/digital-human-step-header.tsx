"use client";

import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DigitalHumanStep } from "@/stores/digital-human-store";

const STEPS: readonly {
	id: DigitalHumanStep;
	index: number;
	labelKey: "digitalHuman.step.figure" | "digitalHuman.step.voice";
}[] = [
	{ id: "figure", index: 1, labelKey: "digitalHuman.step.figure" },
	{ id: "voice", index: 2, labelKey: "digitalHuman.step.voice" },
];

export function DigitalHumanStepHeader({
	canEnterVoiceStep,
	step,
	onStepChange,
}: {
	/** The voiceover step needs a figure, so it stays locked until one is picked. */
	canEnterVoiceStep: boolean;
	step: DigitalHumanStep;
	onStepChange: ({ step }: { step: DigitalHumanStep }) => void;
}) {
	const { t } = useTranslation();

	return (
		<div
			className="flex h-10 shrink-0 items-center gap-2 border-b border-border/40 px-3"
			data-testid="digital-human-steps"
		>
			{STEPS.map((entry, position) => {
				const isActive = step === entry.id;
				const isDisabled = entry.id === "voice" && !canEnterVoiceStep;
				return (
					<div key={entry.id} className="flex items-center gap-2">
						{position > 0 ? (
							<span className="h-px w-6 bg-border" aria-hidden="true" />
						) : null}
						<button
							type="button"
							className={cn(
								"flex items-center gap-1.5 text-[11px] transition-colors",
								isActive ? "text-primary" : "text-muted-foreground",
								isDisabled
									? "cursor-not-allowed opacity-50"
									: "hover:text-foreground"
							)}
							aria-current={isActive ? "step" : undefined}
							disabled={isDisabled}
							data-testid={`digital-human-step-${entry.id}`}
							onClick={() => onStepChange({ step: entry.id })}
						>
							<span
								className={cn(
									"flex size-4 items-center justify-center rounded-full text-[9px] tabular-nums",
									isActive
										? "bg-primary text-primary-foreground"
										: "bg-foreground/15 text-muted-foreground"
								)}
							>
								{entry.index}
							</span>
							<span>{t(entry.labelKey)}</span>
						</button>
					</div>
				);
			})}
		</div>
	);
}
