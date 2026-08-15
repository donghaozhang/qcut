"use client";

import { InfoIcon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/lib/i18n";
import { getSpeechModelsInOrder } from "../../ai/constants/speech-models-config";

/**
 * Voice-cloning and voice-convert models take reference audio, not a script,
 * so they cannot drive this step.
 */
function textToSpeechModels() {
	return getSpeechModelsInOrder().filter(
		([, model]) => "text_to_speech" in model.endpoints
	);
}

export function DigitalHumanVoiceStep({
	script,
	voiceModel,
	onScriptChange,
	onVoiceModelChange,
}: {
	script: string;
	voiceModel: string;
	onScriptChange: (script: string) => void;
	onVoiceModelChange: (voiceModel: string) => void;
}) {
	const { t } = useTranslation();
	const models = useMemo(textToSpeechModels, []);

	return (
		<div className="space-y-3 p-3" data-testid="digital-human-voice-step">
			<div className="space-y-1.5">
				<Label className="text-[11px]">{t("digitalHuman.voice.script")}</Label>
				<Textarea
					className="min-h-24 text-xs"
					placeholder={t("digitalHuman.voice.scriptPlaceholder")}
					value={script}
					data-testid="digital-human-script"
					onChange={(event) => onScriptChange(event.currentTarget.value)}
				/>
				<p className="text-right text-[10px] tabular-nums text-muted-foreground">
					{script.length}
				</p>
			</div>

			<div className="space-y-1.5">
				<Label className="text-[11px]">{t("digitalHuman.voice.model")}</Label>
				<Select value={voiceModel} onValueChange={onVoiceModelChange}>
					<SelectTrigger
						className="h-8 text-xs"
						aria-label={t("digitalHuman.voice.model")}
						data-testid="digital-human-voice-model"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{models.map(([id, model]) => (
							<SelectItem key={id} value={id}>
								{model.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<Button
				type="button"
				className="w-full"
				disabled
				data-testid="digital-human-generate"
			>
				{t("digitalHuman.generate")}
			</Button>
			<p className="flex items-start gap-1.5 rounded border border-border/50 bg-foreground/5 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
				<InfoIcon className="mt-px size-3 shrink-0" aria-hidden="true" />
				<span>{t("digitalHuman.notWired")}</span>
			</p>
		</div>
	);
}
