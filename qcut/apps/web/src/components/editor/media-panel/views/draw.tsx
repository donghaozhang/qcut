import { useRef, useState, useCallback } from "react";
import { PenTool, FolderOpen } from "lucide-react";
import {
	TldrawCanvas,
	type TldrawCanvasHandle,
} from "@/components/editor/draw/tldraw-canvas";
import { CanvasToolbar } from "@/components/editor/draw/components/canvas-toolbar";
import { SavedDrawings } from "@/components/editor/draw/components/saved-drawings";
import { useProjectStore } from "@/stores/project-store";

const DrawView: React.FC = () => {
	const canvasRef = useRef<TldrawCanvasHandle | null>(null);
	const [showFiles, setShowFiles] = useState(false);
	const { activeProject } = useProjectStore();

	const handleLoadDrawing = useCallback((drawingData: string) => {
		if (canvasRef.current) {
			// If the data looks like a tldraw snapshot (starts with {), load as snapshot
			if (drawingData.startsWith("{")) {
				canvasRef.current.loadSnapshot(drawingData);
			}
			// Legacy data URL drawings are no longer directly loadable into tldraw
			// Users can re-import them as images via tldraw's built-in image tool
		}
		setShowFiles(false);
	}, []);

	const persistenceKey = activeProject?.id
		? `qcut-draw-${activeProject.id}`
		: undefined;

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
				<SavedDrawings
					onLoadDrawing={handleLoadDrawing}
					className="flex-1"
				/>
			</div>
		);
	}

	return (
		<div className="p-4 h-full flex flex-col">
			<div className="mb-3">
				<h2 className="text-lg font-bold text-white flex items-center gap-2">
					<PenTool className="w-5 h-5" />
					White Draw
				</h2>
			</div>

			<CanvasToolbar
				canvasRef={canvasRef}
				onShowFiles={() => setShowFiles(true)}
				className="mb-3"
			/>

			<div className="flex-1 min-h-0 rounded-lg overflow-hidden">
				<TldrawCanvas
					ref={canvasRef}
					persistenceKey={persistenceKey}
				/>
			</div>
		</div>
	);
};

export default DrawView;
