import { useRef, useState, useCallback } from "react";
import { PenTool, FolderOpen, Upload, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	TldrawCanvas,
	type TldrawCanvasHandle,
	type AnnotatorImage,
} from "@/components/editor/draw/tldraw-canvas";
import { CanvasToolbar } from "@/components/editor/draw/components/canvas-toolbar";
import { SavedDrawings } from "@/components/editor/draw/components/saved-drawings";
import { useProjectStore } from "@/stores/project-store";

function loadImageFile(file: File): Promise<AnnotatorImage> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error("Failed to read file"));
		reader.onload = () => {
			const src = reader.result as string;
			const img = new Image();
			img.onerror = () => reject(new Error("Failed to load image"));
			img.onload = () => {
				resolve({
					src,
					width: img.naturalWidth,
					height: img.naturalHeight,
					type: file.type,
				});
			};
			img.src = src;
		};
		reader.readAsDataURL(file);
	});
}

/** Image picker shown before annotation starts */
function ImagePicker({
	onChooseImage,
}: {
	onChooseImage: (image: AnnotatorImage) => void;
}) {
	const [isDragging, setIsDragging] = useState(false);

	const handleFile = useCallback(
		async (file: File) => {
			if (!file.type.startsWith("image/")) return;
			const image = await loadImageFile(file);
			onChooseImage(image);
		},
		[onChooseImage]
	);

	const handleFileInput = useCallback(() => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*";
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (file) await handleFile(file);
		};
		input.click();
	}, [handleFile]);

	const handleDrop = useCallback(
		async (e: React.DragEvent) => {
			e.preventDefault();
			setIsDragging(false);
			const file = e.dataTransfer.files[0];
			if (file) await handleFile(file);
		},
		[handleFile]
	);

	return (
		<div
			className={`flex-1 flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
				isDragging
					? "border-orange-500 bg-orange-500/10"
					: "border-gray-600 hover:border-gray-500"
			}`}
			onDragOver={(e) => {
				e.preventDefault();
				setIsDragging(true);
			}}
			onDragLeave={() => setIsDragging(false)}
			onDrop={handleDrop}
		>
			<ImageIcon className="w-12 h-12 text-gray-500 mb-4" />
			<p className="text-gray-400 mb-2">Drop an image here to annotate</p>
			<Button variant="outline" size="sm" onClick={handleFileInput}>
				<Upload className="w-4 h-4 mr-2" />
				Choose Image
			</Button>
		</div>
	);
}

const DrawView: React.FC = () => {
	const canvasRef = useRef<TldrawCanvasHandle | null>(null);
	const [image, setImage] = useState<AnnotatorImage | null>(null);
	const [imageKey, setImageKey] = useState(0);
	const [showFiles, setShowFiles] = useState(false);
	const { activeProject } = useProjectStore();

	const handleChooseImage = useCallback((img: AnnotatorImage) => {
		setImage(img);
		setImageKey((k) => k + 1); // Force remount tldraw
	}, []);

	const handleLoadDrawing = useCallback((drawingData: string) => {
		if (canvasRef.current && drawingData.startsWith("{")) {
			canvasRef.current.loadSnapshot(drawingData);
		}
		setShowFiles(false);
	}, []);

	if (showFiles) {
		return (
			<div className="p-4 h-full flex flex-col">
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-bold text-white flex items-center gap-2">
						<FolderOpen className="w-5 h-5" />
						Saved Drawings
					</h2>
					<button
						type="button"
						onClick={() => setShowFiles(false)}
						className="text-sm text-gray-400 hover:text-white px-3 py-1 rounded-md hover:bg-gray-700 transition-colors"
					>
						Back to Canvas
					</button>
				</div>
				<SavedDrawings onLoadDrawing={handleLoadDrawing} className="flex-1" />
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col px-4 pb-4">
			<div className="mb-2 flex items-center justify-between shrink-0">
				<h2 className="text-lg font-bold text-white flex items-center gap-2">
					<PenTool className="w-5 h-5" />
					Image Annotator
				</h2>
				{image && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleChooseImage(image)}
						title="Change image"
					>
						<Upload className="w-3 h-3 mr-1" />
						New Image
					</Button>
				)}
			</div>

			{image ? (
				<>
					<CanvasToolbar
						canvasRef={canvasRef}
						onShowFiles={() => setShowFiles(true)}
						className="mb-2 shrink-0"
					/>
					<div className="flex-1 min-h-0 rounded-lg overflow-hidden">
						<TldrawCanvas key={imageKey} ref={canvasRef} image={image} />
					</div>
				</>
			) : (
				<ImagePicker onChooseImage={handleChooseImage} />
			)}
		</div>
	);
};

export default DrawView;
