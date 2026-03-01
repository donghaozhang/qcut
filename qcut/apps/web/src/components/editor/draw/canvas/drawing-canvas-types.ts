export interface DrawingCanvasProps {
	className?: string;
	onDrawingChange?: (dataUrl: string) => void;
	backgroundImage?: string;
	disabled?: boolean;
}

// Export the type for the canvas handle that includes both HTMLCanvasElement methods and custom methods
export interface DrawingCanvasHandle extends HTMLCanvasElement {
	handleImageUpload: (file: File) => Promise<string | undefined>;
	loadDrawingFromDataUrl: (dataUrl: string) => Promise<void>;
	getSelectedCount: () => number;
	getHasGroups: () => boolean;
	getCanvasDataUrl: () => string | null;
	handleCreateGroup: () => void;
	handleUngroup: () => void;
	clearAll: () => void;
}
