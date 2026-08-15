"use client";

import { useMemo, useRef, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { useMediaStore } from "@/stores/media/media-store";
import { useDigitalHumanStore } from "@/stores/digital-human-store";
import { BackgroundPicker } from "./components/background-picker";
import { DigitalHumanSection } from "./components/digital-human-section";
import { DigitalHumanSidebar } from "./components/digital-human-sidebar";
import { DigitalHumanStepHeader } from "./components/digital-human-step-header";
import { DigitalHumanVoiceStep } from "./components/digital-human-voice-step";
import { FigureGrid } from "./components/figure-grid";
import { ShotSizeGrid } from "./components/shot-size-grid";
import { selectDigitalHumanImages } from "./digital-human-media";
import { useDigitalHumanImageImport } from "./hooks/use-digital-human-image-import";

type ImportTarget = "background" | "figure";

export function DigitalHumanView() {
	const { t } = useTranslation();
	const mediaItems = useMediaStore((state) => state.mediaItems);
	const images = useMemo(
		() => selectDigitalHumanImages({ mediaItems }),
		[mediaItems]
	);

	const step = useDigitalHumanStore((state) => state.step);
	const setStep = useDigitalHumanStore((state) => state.setStep);
	const figureMediaId = useDigitalHumanStore((state) => state.figureMediaId);
	const setFigureMediaId = useDigitalHumanStore(
		(state) => state.setFigureMediaId
	);
	const shotSize = useDigitalHumanStore((state) => state.shotSize);
	const setShotSize = useDigitalHumanStore((state) => state.setShotSize);
	const backgroundColor = useDigitalHumanStore(
		(state) => state.backgroundColor
	);
	const backgroundMediaId = useDigitalHumanStore(
		(state) => state.backgroundMediaId
	);
	const setBackgroundColor = useDigitalHumanStore(
		(state) => state.setBackgroundColor
	);
	const setBackgroundMediaId = useDigitalHumanStore(
		(state) => state.setBackgroundMediaId
	);
	const script = useDigitalHumanStore((state) => state.script);
	const setScript = useDigitalHumanStore((state) => state.setScript);
	const voiceModel = useDigitalHumanStore((state) => state.voiceModel);
	const setVoiceModel = useDigitalHumanStore((state) => state.setVoiceModel);

	const { importImages } = useDigitalHumanImageImport();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const importTargetRef = useRef<ImportTarget>("figure");

	const openImport = ({ target }: { target: ImportTarget }) => {
		importTargetRef.current = target;
		fileInputRef.current?.click();
	};

	const handleFileChange = async ({
		currentTarget,
	}: ChangeEvent<HTMLInputElement>) => {
		const files = [...(currentTarget.files ?? [])];
		// Reset before awaiting so re-picking the same file still fires a change.
		currentTarget.value = "";
		const target = importTargetRef.current;
		const [firstId] = await importImages({ files });
		if (!firstId) return;
		if (target === "figure") {
			setFigureMediaId(firstId);
			return;
		}
		setBackgroundMediaId(firstId);
	};

	return (
		<div
			className="flex h-full min-h-0 flex-col bg-panel text-foreground"
			data-testid="digital-human-panel"
		>
			<div className="flex min-h-0 flex-1 overflow-hidden">
				<DigitalHumanSidebar />

				<section className="flex min-w-0 flex-1 flex-col overflow-hidden">
					<DigitalHumanStepHeader
						canEnterVoiceStep={Boolean(figureMediaId)}
						step={step}
						onStepChange={({ step: nextStep }) => setStep(nextStep)}
					/>

					<div className="min-h-0 flex-1 overflow-y-auto">
						{step === "figure" ? (
							<>
								<DigitalHumanSection
									testId="digital-human-figure"
									title={t("digitalHuman.section.figure")}
								>
									<FigureGrid
										images={images}
										selectedMediaId={figureMediaId}
										onImport={() => openImport({ target: "figure" })}
										onSelect={({ mediaId }) => setFigureMediaId(mediaId)}
									/>
								</DigitalHumanSection>

								<DigitalHumanSection
									testId="digital-human-shot"
									title={t("digitalHuman.section.shotSize")}
								>
									<ShotSizeGrid
										selected={shotSize}
										onSelect={({ shotSize: nextShotSize }) =>
											setShotSize(nextShotSize)
										}
									/>
								</DigitalHumanSection>

								<DigitalHumanSection
									testId="digital-human-background"
									title={t("digitalHuman.section.background")}
								>
									<BackgroundPicker
										backgroundColor={backgroundColor}
										backgroundMediaId={backgroundMediaId}
										images={images}
										onImportImage={() => openImport({ target: "background" })}
										onSelectColor={({ color }) => setBackgroundColor(color)}
										onSelectImage={({ mediaId }) =>
											setBackgroundMediaId(mediaId)
										}
									/>
								</DigitalHumanSection>

								<div className="p-3">
									<Button
										type="button"
										className="w-full"
										disabled={!figureMediaId}
										data-testid="digital-human-next"
										onClick={() => setStep("voice")}
									>
										{t("digitalHuman.next")}
									</Button>
								</div>
							</>
						) : (
							<DigitalHumanVoiceStep
								script={script}
								voiceModel={voiceModel}
								onScriptChange={setScript}
								onVoiceModelChange={setVoiceModel}
							/>
						)}
					</div>
				</section>
			</div>

			<input
				ref={fileInputRef}
				type="file"
				accept="image/png,image/jpeg,image/webp"
				multiple
				className="hidden"
				onChange={handleFileChange}
			/>
		</div>
	);
}
