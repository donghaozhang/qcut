import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	getCaptionFileExtension,
	type CaptionFormat,
} from "@/lib/captions/caption-export";

// ---------------------------------------------------------------------------
// Shared caption format definitions
// ---------------------------------------------------------------------------

const CAPTION_FORMATS: {
	value: CaptionFormat;
	label: string;
	description: string;
}[] = [
	{ value: "srt", label: "SRT", description: "SubRip Subtitles (.srt)" },
	{ value: "vtt", label: "VTT", description: "WebVTT (.vtt)" },
	{
		value: "ass",
		label: "ASS",
		description: "Advanced SubStation Alpha (.ass)",
	},
	{
		value: "ttml",
		label: "TTML",
		description: "Timed Text Markup Language (.ttml)",
	},
];

// ---------------------------------------------------------------------------
// Prop interfaces
// ---------------------------------------------------------------------------

export interface CaptionExportCardProps {
	exportCaptionsEnabled: boolean;
	onExportCaptionsChange: (checked: boolean) => void;
	captionFormat: CaptionFormat;
	onCaptionFormatChange: (format: CaptionFormat) => void;
	filename: string;
	isExporting: boolean;
}

export interface AudioExportCardProps {
	includeAudio: boolean;
	onIncludeAudioChange: (checked: boolean) => void;
	isExporting: boolean;
}

// ---------------------------------------------------------------------------
// CaptionExportCard
// ---------------------------------------------------------------------------

export function CaptionExportCard({
	exportCaptionsEnabled,
	onExportCaptionsChange,
	captionFormat,
	onCaptionFormatChange,
	filename,
	isExporting,
}: CaptionExportCardProps) {
	return (
		<Card className="">
			<CardHeader className="pb-3">
				<CardTitle className="text-sm">Caption Export</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center space-x-2">
					<Checkbox
						id="export-captions"
						checked={exportCaptionsEnabled}
						onCheckedChange={(checked) =>
							onExportCaptionsChange(checked as boolean)
						}
						disabled={isExporting}
						data-testid="export-include-captions-checkbox"
					/>
					<Label htmlFor="export-captions" className="text-sm cursor-pointer">
						Export captions as separate file
					</Label>
				</div>

				{exportCaptionsEnabled && (
					<div className="space-y-3 pl-6">
						<div>
							<Label className="text-xs font-medium">Caption Format</Label>
							<RadioGroup
								value={captionFormat}
								onValueChange={(value) =>
									onCaptionFormatChange(value as CaptionFormat)
								}
								disabled={isExporting}
								className="mt-2"
							>
								{CAPTION_FORMATS.map((format) => (
									<div
										key={format.value}
										className="flex items-center space-x-2"
									>
										<RadioGroupItem value={format.value} id={format.value} />
										<Label
											htmlFor={format.value}
											className="text-sm cursor-pointer"
										>
											<div>
												<div className="font-medium">{format.label}</div>
												<div className="text-xs text-muted-foreground">
													{format.description}
												</div>
											</div>
										</Label>
									</div>
								))}
							</RadioGroup>
						</div>

						<div className="text-xs text-muted-foreground">
							Caption file will be downloaded as: {filename}.
							{getCaptionFileExtension(captionFormat)}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

// ---------------------------------------------------------------------------
// AudioExportCard
// ---------------------------------------------------------------------------

export function AudioExportCard({
	includeAudio,
	onIncludeAudioChange,
	isExporting,
}: AudioExportCardProps) {
	return (
		<Card className="">
			<CardHeader className="pb-3">
				<CardTitle className="text-sm">Audio Export</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center space-x-2">
					<Checkbox
						id="include-audio"
						checked={includeAudio}
						onCheckedChange={(checked) =>
							onIncludeAudioChange(checked as boolean)
						}
						disabled={isExporting}
						data-testid="export-include-audio-checkbox"
					/>
					<Label htmlFor="include-audio" className="text-sm cursor-pointer">
						Include audio in export
					</Label>
				</div>
				{includeAudio && (
					<div className="text-xs text-muted-foreground pl-6">
						Audio tracks will be mixed and included in the exported video
					</div>
				)}
			</CardContent>
		</Card>
	);
}
