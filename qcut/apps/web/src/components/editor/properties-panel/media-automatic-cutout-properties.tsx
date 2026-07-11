import { Loader2, ScanSearch, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocalPersonCutoutPanel } from "@/components/editor/segmentation/LocalPersonCutoutPanel";
import {
	attachGeneratedMask,
	failGeneratedMaskTracking,
} from "@/lib/segmentation/generated-mask-attachment";
import { createObjectURL } from "@/lib/media/blob-manager";
import { generateSam3VideoMask } from "@/lib/segmentation/sam3-video-mask";
import { useMediaStore } from "@/stores/media/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useSegmentationStore } from "@/stores/ai/segmentation-store";
import type { MediaElement } from "@/types/timeline";
import { PropertyGroup, PropertyItemLabel } from "./property-item";

type AutomaticCutoutMode = "person" | "object";

export function MediaAutomaticCutoutProperties({
	element,
}: {
	element: MediaElement;
}) {
	const projectId = useProjectStore((state) => state.activeProject?.id);
	const mediaItem = useMediaStore((state) =>
		state.mediaItems.find((item) => item.id === element.mediaId)
	);
	const addMediaItem = useMediaStore((state) => state.addMediaItem);
	const setSegmentationSource = useSegmentationStore(
		(state) => state.setSourceVideo
	);
	const [mode, setMode] = useState<AutomaticCutoutMode>("person");
	const [objectPrompt, setObjectPrompt] = useState("");
	const [isObjectProcessing, setIsObjectProcessing] = useState(false);
	const [objectStatus, setObjectStatus] = useState("");
	const [objectResultUrl, setObjectResultUrl] = useState<string | null>(null);
	const sourceUrl = useMemo(() => {
		if (!mediaItem) return null;
		return (
			mediaItem.url ??
			createObjectURL(mediaItem.file, `properties-cutout-${element.id}`)
		);
	}, [element.id, mediaItem]);
	const sourceFile = mediaItem?.file;

	useEffect(() => {
		if (!element.id) return;
		setObjectPrompt("");
		setObjectStatus("");
		setObjectResultUrl(null);
		if (sourceFile && sourceUrl) {
			setSegmentationSource(sourceFile, sourceUrl);
		}
	}, [element.id, setSegmentationSource, sourceFile, sourceUrl]);

	const runObjectCutout = async () => {
		const prompt = objectPrompt.trim();
		if (!projectId || !mediaItem || !prompt || isObjectProcessing) return;
		setIsObjectProcessing(true);
		setObjectStatus("Uploading source video...");
		try {
			const result = await generateSam3VideoMask({
				sourceFile: mediaItem.file,
				prompt,
			});
			setObjectStatus("Saving tracked mask...");
			const sourceMediaId = await addMediaItem(projectId, {
				name: `Tracked: ${prompt}`,
				type: "video",
				file: result.file,
				url: result.url,
				originalUrl: result.originalUrl,
				metadata: {
					source: "sam3-video-mask",
					hasAlpha: result.hasAlpha,
					codec: "vp9",
					prompt,
				},
			});
			const attached = attachGeneratedMask({
				sourceMediaId,
				type: "object",
				source: "sam3",
				name: `SAM3: ${prompt}`,
				trackingSamples: result.trackingSamples,
				targetElementId: element.id,
			});
			setObjectResultUrl(result.url);
			setObjectStatus(
				attached ? "Object mask attached" : "Tracked mask added to Media"
			);
			toast.success(
				attached
					? "Object mask attached to selected clip"
					: "Tracked mask added to Media"
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			failGeneratedMaskTracking({ message });
			setObjectStatus("Object tracking failed");
			toast.error("Object tracking failed", { description: message });
		} finally {
			setIsObjectProcessing(false);
		}
	};

	const sourceReady = Boolean(projectId && mediaItem && sourceUrl);

	return (
		<PropertyGroup title="Automatic cutout" defaultExpanded>
			<Tabs
				value={mode}
				onValueChange={(value) => setMode(value as AutomaticCutoutMode)}
			>
				<TabsList className="grid h-8 w-full grid-cols-2 rounded-sm p-0.5">
					<TabsTrigger value="person" className="gap-1.5 text-xs">
						<UserRound className="size-3.5" />
						Local person
					</TabsTrigger>
					<TabsTrigger value="object" className="gap-1.5 text-xs">
						<ScanSearch className="size-3.5" />
						Cloud object
					</TabsTrigger>
				</TabsList>

				<TabsContent value="person" className="mt-3">
					{sourceReady && projectId && mediaItem && sourceUrl ? (
						<LocalPersonCutoutPanel
							projectId={projectId}
							sourceFile={mediaItem.file}
							sourceUrl={sourceUrl}
							addMediaItem={addMediaItem}
							onMaskReady={({ sourceMediaId, trackingSamples }) =>
								attachGeneratedMask({
									sourceMediaId,
									type: "person",
									source: "mediapipe",
									name: "MediaPipe person",
									trackingSamples,
									targetElementId: element.id,
								})
							}
							onMaskError={(message) => failGeneratedMaskTracking({ message })}
						/>
					) : (
						<p className="py-4 text-center text-xs text-muted-foreground">
							The selected clip source is unavailable.
						</p>
					)}
				</TabsContent>

				<TabsContent value="object" className="mt-3 space-y-3">
					<div className="space-y-1.5">
						<PropertyItemLabel>Object description</PropertyItemLabel>
						<Input
							value={objectPrompt}
							onChange={(event) => setObjectPrompt(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") void runObjectCutout();
							}}
							placeholder="person, car, product..."
							aria-label="Object description"
							disabled={isObjectProcessing}
						/>
					</div>
					<Button
						type="button"
						className="w-full"
						disabled={
							!sourceReady || !objectPrompt.trim() || isObjectProcessing
						}
						onClick={() => void runObjectCutout()}
					>
						{isObjectProcessing ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<ScanSearch className="size-4" />
						)}
						Generate and attach mask
					</Button>
					{objectStatus ? (
						<p className="text-xs text-muted-foreground" role="status">
							{objectStatus}
						</p>
					) : null}
					{objectResultUrl ? (
						<video
							controls
							playsInline
							src={objectResultUrl}
							className="max-h-56 w-full rounded-sm border bg-black object-contain"
						/>
					) : null}
				</TabsContent>
			</Tabs>
		</PropertyGroup>
	);
}
